/*
 * Jumperless Serial Terminal — pinned editor tab for Jumperless serial ports.
 *
 * Simplified: no WebUSB, no CDC interface resolution. Uses
 * navigator.serial.requestPort() to let the user pick a port.
 * xterm is opened lazily when the tab is first shown.
 */

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { QID, QS } from './utils.js'
import { getTerminalOptions } from './terminal_utils.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_BAUD = 115200

/** Bytes sent to the Jumperless immediately after connecting. */
const CONNECT_INIT_STRING = 'B1 \n'

/** Pinned tab DOM id */
const TAB_ID = 'pinned-serial-term'

// ─── Module state ─────────────────────────────────────────────────────────────

/** @type {Terminal|null} */
let term = null
/** @type {FitAddon|null} */
let fitAddon = null
/** Whether xterm has been opened into the DOM (lazy) */
let termOpened = false
/** @type {SerialPort|null} */
let activePort = null
/** @type {ReadableStreamDefaultReader|null} */
let reader = null
/** @type {WritableStreamDefaultWriter|null} */
let writer = null
/** @type {Promise|null} */
let readableStreamClosed = null
/** @type {boolean} */
let connected = false
/** Disposable from term.onData — keeps only one handler at a time */
let onDataDisposable = null

// ─── UI helpers ───────────────────────────────────────────────────────────────

function updateStatusUI(isConnected, message) {
    const btn    = QS('#serial-term-connect-btn')
    const status = QS('#serial-term-status')
    if (btn) {
        btn.textContent = isConnected ? 'Disconnect' : 'Connect'
        btn.disabled    = false
    }
    if (status) {
        status.textContent = message ?? (isConnected ? 'Connected' : 'Not connected')
    }
}

/** Build a display label from a SerialPort. */
function portLabel(port) {
    try {
        const info = port.getInfo()
        if (info.usbVendorId != null) {
            const vid = info.usbVendorId.toString(16).padStart(4, '0')
            const pid = info.usbProductId.toString(16).padStart(4, '0')
            let label = `Serial ${vid}:${pid}`
            if (info.usbInterfaceNumber != null) {
                label += ` (iface ${info.usbInterfaceNumber})`
            }
            return label
        }
    } catch (_) {}
    return 'Serial Port'
}

// ─── xterm lazy init ──────────────────────────────────────────────────────────

function ensureTermOpen() {
    if (termOpened) {
        try { fitAddon.fit() } catch (_) {}
        return
    }

    const xtermEl = QID('serial-term-xterm')
    if (!xtermEl) return

    term.open(xtermEl)
    termOpened = true

    requestAnimationFrame(() => {
        try { fitAddon.fit() } catch (_) {}
    })

    new ResizeObserver(() => { try { fitAddon.fit() } catch (_) {} }).observe(xtermEl)
}

// ─── Connect / Disconnect ─────────────────────────────────────────────────────

export async function disconnect(clearScreen = false) {
    if (onDataDisposable) {
        try { onDataDisposable.dispose() } catch (_) {}
        onDataDisposable = null
    }

    if (reader) {
        try { await reader.cancel() } catch (_) {}
        reader = null
    }
    if (readableStreamClosed) {
        try { await readableStreamClosed } catch (_) {}
        readableStreamClosed = null
    }
    if (writer) {
        try { writer.releaseLock() } catch (_) {}
        writer = null
    }
    if (activePort) {
        try { await activePort.close() } catch (_) {}
        activePort = null
    }
    connected = false
    if (term && clearScreen) term.clear()
    updateStatusUI(false)
}

/**
 * Connect to a specific SerialPort object.
 * @param {SerialPort} port
 */
async function connectToPort(port) {
    if (connected) await disconnect(false)

    if (!port) {
        updateStatusUI(false, 'Port not available')
        return
    }

    const label = portLabel(port)
    const btn = QS('#serial-term-connect-btn')
    if (btn) btn.disabled = true

    try {
        console.log('[SerialTerm] Serial Port Info:', port.getInfo())
    } catch (_) {}

    try {
        await port.open({ baudRate: DEFAULT_BAUD })
    } catch (err) {
        console.error('[SerialTerm] port.open failed', err)
        updateStatusUI(false, err.name === 'InvalidStateError'
            ? 'Port already open elsewhere. Disconnect there first.'
            : `Open failed: ${err.message}`)
        if (btn) btn.disabled = false
        return
    }

    activePort = port

    const decoderStream   = new TextDecoderStream()
    readableStreamClosed  = port.readable.pipeTo(decoderStream.writable)
    reader                = decoderStream.readable.getReader()
    writer                = port.writable.getWriter()
    connected             = true

    // Send init string for Jumperless
    writer.write(new TextEncoder().encode(CONNECT_INIT_STRING)).catch(() => {})

    port.addEventListener('disconnect', () => disconnect(false))

    // Read loop: serial → xterm
    ;(async () => {
        try {
            for (;;) {
                const { value, done } = await reader.read()
                if (done) break
                if (term && termOpened) term.write(value)
            }
        } catch (_) {
        } finally {
            if (connected) disconnect(false)
        }
    })()

    // Write: xterm keystrokes → serial
    if (onDataDisposable) {
        try { onDataDisposable.dispose() } catch (_) {}
    }
    if (term) {
        onDataDisposable = term.onData(data => {
            if (!writer) return
            writer.write(new TextEncoder().encode(data)).catch(() => {})
        })
    }

    if (term && termOpened) {
        term.write(`\r\n\x1b[32m*** Connected to ${label} ***\x1b[0m\r\n`)
    }
    updateStatusUI(true, label)
    if (btn) btn.disabled = false
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function isPort1Connected() { return connected }

export function focusPort1Tab() {
    const tab = QS(`#editor-tabs [data-pinned="${TAB_ID}"]`)
    if (tab) tab.click()
}

/**
 * Create the pinned "Serial Terminal" editor tab and wire everything up.
 * Called once during app initialization.
 */
export function createPort1EditorTab() {
    const tabContainer      = QID('editor-tabs')
    const terminalContainer = QID('terminal-container')

    if (QS(`#editor-tabs [data-pinned="${TAB_ID}"]`)) return

    // ── 1. Tab button ────────────────────────────────────────────────────────
    tabContainer.insertAdjacentHTML('beforeend', `
        <div class="tab tab-pinned" data-pinned="${TAB_ID}" id="${TAB_ID}-tab" title="Jumperless Serial Terminal">
            <i class="fa-solid fa-terminal"></i>&nbsp;Serial Terminal
        </div>
    `)

    // ── 2. Editor pane ───────────────────────────────────────────────────────
    terminalContainer.insertAdjacentHTML('beforebegin', `
        <div class="editor-tab-pane serial-term-pane" id="${TAB_ID}-pane">
            <div class="serial-term-header">
                <button type="button" id="serial-term-connect-btn" class="serial-term-btn">Connect</button>
                <span id="serial-term-status" class="serial-term-status">Not connected</span>
                <div class="serial-term-spacer"></div>
                <div class="serial-term-font-controls">
                    <button type="button" class="serial-term-btn st-font-dec" title="Decrease font size"><i class="fa-solid fa-minus"></i></button>
                    <button type="button" class="serial-term-btn st-font-inc" title="Increase font size"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>
            <div id="serial-term-xterm" class="serial-term-xterm"></div>
        </div>
    `)

    // ── 3. xterm instance (not opened yet — pane is hidden) ──────────────────
    term = new Terminal(getTerminalOptions({
        cursorBlink: true,
    }))
    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // ── 4. Tab click ─────────────────────────────────────────────────────────
    const tabEl  = QID(`${TAB_ID}-tab`)
    const paneEl = QID(`${TAB_ID}-pane`)

    tabEl.addEventListener('click', () => {
        document.querySelectorAll('#editor-tabs .tab').forEach(t => t.classList.remove('active'))
        document.querySelectorAll('.editor-tab-pane, .serial-term-pane').forEach(p => p.classList.remove('active'))
        tabEl.classList.add('active')
        paneEl.classList.add('active')
        ensureTermOpen()
    })

    // ── 5. Font Size Controls ────────────────────────────────────────────────
    paneEl.querySelector('.st-font-dec').addEventListener('click', () => {
        if (term) {
            term.options.fontSize = Math.max(6, term.options.fontSize - 1)
            try { fitAddon.fit() } catch (_) {}
        }
    })
    paneEl.querySelector('.st-font-inc').addEventListener('click', () => {
        if (term) {
            term.options.fontSize = Math.min(48, term.options.fontSize + 1)
            try { fitAddon.fit() } catch (_) {}
        }
    })

    // ── 6. Connect / Disconnect button ───────────────────────────────────────
    QID('serial-term-connect-btn').addEventListener('click', async () => {
        if (connected) {
            await disconnect(false)
            return
        }
        // Use the browser's built-in port picker
        try {
            const port = await navigator.serial.requestPort()
            await connectToPort(port)
        } catch (err) {
            if (err.name !== 'NotFoundError') {
                console.warn('[SerialTerm] requestPort failed', err)
            }
        }
    })
}
