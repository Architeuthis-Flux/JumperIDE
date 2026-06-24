/*
 * Wokwi integration for JumperIDE.
 *
 * Mirrors the data flow of Jumperless-App/JumperlessWokwiBridge.py (protocol
 * only — NOT its Python serial machinery): poll a Wokwi project's diagram.json
 * and push it to the device's onboard Wokwi parser via the `W` command, and
 * compile+flash the Arduino sketch through a cloud compiler.
 *
 * All Wokwi network access goes through our Cloudflare Worker (Wokwi's API has
 * no CORS headers). Device I/O uses the browser's WebSerial directly.
 */

import { STK500, WebSerialTransport, BOARDS, boardFromFqbn } from 'webserial-flasher'
import { parseWokwiId, idToProjectUrl, hashDiagram, mapPinName, constructNetlist, buildWokwiCommand } from './wokwi_protocol.mjs'
import { acquirePort, findGrantedPort, withPortFreed, JL_USB } from './jumperless_ports.mjs'

// Re-export the pure protocol helpers so UI code has a single import surface.
export { parseWokwiId, idToProjectUrl, hashDiagram, mapPinName, constructNetlist, buildWokwiCommand }

/* global __SCRIPT_REGISTRY_API_BASE__ */
const API_BASE = (typeof __SCRIPT_REGISTRY_API_BASE__ !== 'undefined' && __SCRIPT_REGISTRY_API_BASE__)
    ? String(__SCRIPT_REGISTRY_API_BASE__).replace(/\/$/, '')
    : ''

// ─── Worker-backed network ───────────────────────────────────────────────────

export function isConfigured() { return !!API_BASE }

/** Fetch just the diagram (lightweight; used by the poll loop). */
export async function fetchDiagram(id) {
    if (!API_BASE) throw new Error('Wokwi proxy not configured (build with SCRIPT_REGISTRY_API_BASE)')
    const r = await fetch(`${API_BASE}/wokwi/${encodeURIComponent(id)}?part=diagram`)
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `Failed to fetch diagram (${r.status})`)
    return data.diagram
}

/** Fetch the full project { diagram, sketch, libraries, files } from the zip. */
export async function fetchProject(id) {
    if (!API_BASE) throw new Error('Wokwi proxy not configured (build with SCRIPT_REGISTRY_API_BASE)')
    const r = await fetch(`${API_BASE}/wokwi/${encodeURIComponent(id)}`)
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `Failed to fetch project (${r.status})`)
    return data
}

/**
 * Compile a sketch via the worker's pluggable compile backend.
 * @param {{sketch:string, files?:Array<{name,content}>, board?:string}} req
 * @returns {Promise<{hex:string, eep:string, stdout:string, stderr:string}>}
 */
export async function compileSketch({ sketch, files = [], board = 'nano' }) {
    if (!API_BASE) throw new Error('Compile proxy not configured (build with SCRIPT_REGISTRY_API_BASE)')
    const r = await fetch(`${API_BASE}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sketch, files, board }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || `Compile request failed (${r.status})`)
    if (!data.hex) throw new Error(data.stderr || 'Compilation failed')
    return data
}

// ─── Command-interface serial connection (separate from the REPL) ────────────
//
// A dedicated WebSerial connection used only to push the `W` command. Kept
// independent of JumperIDE's main MicroPython REPL `port` so wiring sync never
// disturbs the REPL. Mirrors the lightweight pattern in
// jumperless_serial_terminal.js (no Transport class needed — we just write).

const CMD_BAUD = 115200

class CommandPort {
    constructor() {
        this.port = null
        this.writer = null
        this.reader = null
        this.readableStreamClosed = null
        this.connected = false
        this.onLine = null      // optional callback(string) for device output lines
        this._lineBuf = ''
    }

    async connect() {
        if (this.connected) return
        // Auto-pick the "Jumperless Main" command interface (silent if already
        // granted); only prompts the first time. Honors any user override.
        const port = await acquirePort('command')
        await port.open({ baudRate: CMD_BAUD })
        this.port = port
        this.writer = port.writable.getWriter()
        this.connected = true

        // Read loop: surface device output lines (so callers can spot errors).
        const decoder = new TextDecoderStream()
        this.readableStreamClosed = port.readable.pipeTo(decoder.writable).catch(() => {})
        this.reader = decoder.readable.getReader()
        ;(async () => {
            try {
                for (;;) {
                    const { value, done } = await this.reader.read()
                    if (done) break
                    if (value) this._ingest(value)
                }
            } catch (_) { /* reader cancelled on disconnect */ }
        })()

        port.addEventListener('disconnect', () => this.disconnect())
    }

    _ingest(text) {
        if (!this.onLine) return
        this._lineBuf += text
        let idx
        while ((idx = this._lineBuf.indexOf('\n')) >= 0) {
            const line = this._lineBuf.slice(0, idx).replace(/\r$/, '')
            this._lineBuf = this._lineBuf.slice(idx + 1)
            if (line) try { this.onLine(line) } catch (_) {}
        }
    }

    async write(str) {
        if (!this.writer) throw new Error('Command port not connected')
        await this.writer.write(new TextEncoder().encode(str))
    }

    async disconnect() {
        this.connected = false
        if (this.reader) { try { await this.reader.cancel() } catch (_) {} this.reader = null }
        if (this.readableStreamClosed) { try { await this.readableStreamClosed } catch (_) {} this.readableStreamClosed = null }
        if (this.writer) { try { this.writer.releaseLock() } catch (_) {} this.writer = null }
        if (this.port) { try { await this.port.close() } catch (_) {} this.port = null }
    }
}

// ─── Bridge controller ───────────────────────────────────────────────────────
//
// Owns the command-port connection, the poll loop, and exposes compile/flash.
// One instance per Wokwi tab.

export class WokwiBridge {
    constructor({ log = () => {}, onStatus = () => {} } = {}) {
        this.log = log
        this.onStatus = onStatus
        this.cmd = new CommandPort()
        this.cmd.onLine = (line) => {
            // Surface device-side parse errors; firmware app-mode is otherwise quiet.
            if (/✗|error|fail/i.test(line)) this.log(`device: ${line}`, 'warn')
        }
        this.projectId = null
        this.slot = 0
        this.intervalMs = 3000
        this._timer = null
        this._lastHash = null
        this._busy = false
        this.isV5 = true
        /** Optional WokwiEmbed; when connected it's the LIVE diagram source. */
        this.embed = null
    }

    setEmbed(embed) { this.embed = embed; this._lastHash = null }
    get hasLiveEmbed() { return !!(this.embed && this.embed.connected) }
    /** Sync works when we have a live embed (preferred) or a project URL. */
    get hasSource() { return this.hasLiveEmbed || !!this.projectId }

    // — command port —
    async connectDevice() {
        await this.cmd.connect()
        this.onStatus('device-connected')
        this.log('Connected to Jumperless command port', 'ok')
    }
    async disconnectDevice() {
        await this.cmd.disconnect()
        this.onStatus('device-disconnected')
        this.log('Disconnected command port')
    }
    get deviceConnected() { return this.cmd.connected }

    // — wiring sync —
    setProject(input) {
        const id = parseWokwiId(input)
        this.projectId = id
        this._lastHash = null // force next poll to push
        return id
    }
    setSlot(slot) { this.slot = Math.max(0, Math.min(7, slot | 0)) }
    setInterval(ms) {
        this.intervalMs = Math.max(1000, ms | 0)
        if (this._timer) { this.stopSync(); this.startSync() }
    }

    async pushOnce({ force = false } = {}) {
        if (!this.hasSource) throw new Error('No Wokwi project or embed set')
        if (this._busy) return
        this._busy = true
        try {
            // Live embed edits are the source of truth; fall back to the URL.
            let diagram
            if (this.hasLiveEmbed) {
                try { diagram = await this.embed.getDiagram() }
                catch (e) {
                    if (!this.projectId) throw e
                    this.log(`Embed read failed (${e.message}); using project URL`, 'warn')
                    diagram = await fetchDiagram(this.projectId)
                }
            } else {
                diagram = await fetchDiagram(this.projectId)
            }
            const hash = hashDiagram(diagram)
            if (!force && hash === this._lastHash) return // unchanged
            this._lastHash = hash
            if (!this.cmd.connected) { this.log('Device not connected; skipping push', 'warn'); return }
            await this.cmd.write(buildWokwiCommand(this.slot, diagram))
            this.log(`Pushed diagram to slot ${this.slot}`, 'ok')
            this.onStatus('pushed')
        } finally {
            this._busy = false
        }
    }

    startSync() {
        if (this._timer) return
        if (!this.hasSource) throw new Error('No Wokwi project or embed set')
        this.onStatus('sync-on')
        this.log(`Sync started (every ${this.intervalMs} ms, slot ${this.slot})`, 'ok')
        const tick = async () => {
            try { await this.pushOnce() }
            catch (e) { this.log(`Sync error: ${e.message}`, 'warn') }
        }
        tick()
        this._timer = setInterval(tick, this.intervalMs)
    }
    stopSync() {
        if (this._timer) { clearInterval(this._timer); this._timer = null }
        this.onStatus('sync-off')
        this.log('Sync stopped')
    }
    get syncing() { return !!this._timer }

    /** Push the user's sketch into the live embed so its simulation runs it. */
    async sendSketchToEmbed(sketch) {
        if (!this.hasLiveEmbed) throw new Error('No live Wokwi embed connected')
        await this.embed.uploadFile('sketch.ino', sketch)
        this.log('Sent sketch to the embed', 'ok')
    }

    // — compile & flash —
    // `sketch` is our editor's content (the source of truth for code). If
    // omitted, falls back to the project URL's saved sketch.
    async compileAndFlash({ board = 'nano', baudRate, sketch } = {}) {
        let files = []
        if (sketch == null) {
            if (!this.projectId) throw new Error('No sketch to compile')
            this.log('Fetching project files…')
            const project = await fetchProject(this.projectId)
            sketch = project.sketch
            files = project.files || []
        }
        if (!sketch || !sketch.trim()) throw new Error('No sketch.ino content')
        this.log('Compiling sketch in the cloud…')
        const { hex, stdout, stderr } = await compileSketch({ sketch, files, board })
        if (stderr) this.log(stderr, 'warn')
        if (stdout) this.log(stdout)
        this.log('Compiled. Select the Arduino serial port to flash…', 'ok')
        await flashHex(hex, { board, baudRate, log: this.log })
    }
}

// ─── Flasher (STK500v1 over WebSerial) ───────────────────────────────────────

/**
 * Flash an Intel HEX string to an AVR board over WebSerial using STK500v1.
 * Prompts the user to pick the Arduino-passthrough serial port.
 * @param {string} hex Intel HEX text
 * @param {{board?:string, baudRate?:number, log?:Function}} opts
 */
export async function flashHex(hex, { board = 'nano', baudRate, log = () => {} } = {}) {
    if (!hex) throw new Error('No firmware to flash')
    const boardDef = pickBoard(board)
    // Prefer the auto-discovered Arduino/UART passthrough port (interface 2, or a
    // user override) with no picker; fall back to a Jumperless-filtered picker.
    const known = await findGrantedPort('flash')

    // If a serial terminal is holding the Arduino port, disconnect it for the
    // flash and reconnect it afterward (otherwise port.open() throws).
    return withPortFreed(known, async () => {
        const transport = known
            ? new WebSerialTransport(known)
            : await WebSerialTransport.requestPort([JL_USB])
        patchSetSignals(transport)
        const opened = { ...boardDef }
        if (baudRate) opened.baudRate = baudRate
        await transport.open(opened.baudRate || 115200)
        try {
            const stk = new STK500(transport, opened)
            await stk.bootload(hex, (_status, pct) => {
                if (typeof pct === 'number') log(`Flashing… ${Math.round(pct)}%`)
            })
            log('Flash complete', 'ok')
        } finally {
            try { await transport.close() } catch (_) {}
        }
    })
}

/**
 * webserial-flasher v1.0.1 toggles the bootloader reset with `setSignals({dtr})`
 * / `{rts}`, but Chrome's Web Serial dictionary only recognizes
 * `{dataTerminalReady, requestToSend, break}`. Unknown keys are dropped, leaving
 * an empty dict → "Signals dictionary must contain at least one member." Wrap
 * the transport's setSignals to translate the keys.
 */
function patchSetSignals(transport) {
    if (typeof transport.setSignals !== 'function' || transport.__signalsPatched) return
    const orig = transport.setSignals.bind(transport)
    transport.setSignals = (opts = {}) => {
        const mapped = {}
        if ('dtr' in opts) mapped.dataTerminalReady = opts.dtr
        if ('rts' in opts) mapped.requestToSend = opts.rts
        if ('dataTerminalReady' in opts) mapped.dataTerminalReady = opts.dataTerminalReady
        if ('requestToSend' in opts) mapped.requestToSend = opts.requestToSend
        if ('break' in opts) mapped.break = opts.break
        return orig(Object.keys(mapped).length ? mapped : { dataTerminalReady: false })
    }
    transport.__signalsPatched = true
}

function pickBoard(board) {
    // Accept friendly names, BOARDS keys, or an fqbn.
    if (board && board.includes(':')) {
        const b = boardFromFqbn(board)
        if (b) return b
    }
    const key = board === 'uno' ? 'arduino-uno' : board === 'nano' ? 'arduino-nano' : board
    return BOARDS[key] || BOARDS['arduino-nano']
}
