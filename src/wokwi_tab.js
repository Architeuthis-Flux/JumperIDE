/*
 * Wokwi tab for JumperIDE.
 *
 * A single tab laid out like the official Wokwi editor: our code editor on the
 * left and the Wokwi simulator (experimental embed) on the right, with a
 * draggable divider. The embed is login-free and exposes a postMessage API, so:
 *   - diagram (circuit) is edited in the embed; we read it LIVE and push wiring
 *     to the device (`W` command) — no Wokwi save/URL needed.
 *   - code is edited in our pane; "Run in sim" uploads it to the embed, and
 *     "Compile & Flash" sends it to the cloud compiler then to the Arduino.
 *
 * Saving: there's no login-free way to persist back to wokwi.com, so "Save to
 * Jumperless" writes diagram.json + sketch.ino + a README (how to re-open in
 * Wokwi) into /wokwi/<name> on the device. A regular wokwi link can still be
 * loaded (it seeds the embed + editor) or opened on wokwi.com.
 */

import { createTab, displayOpenFile } from './editor_tabs.js'
import { WokwiBridge, flashHex, fetchProject, parseWokwiId, idToProjectUrl, isConfigured } from './wokwi.js'
import { WokwiEmbed } from './wokwi_embed.js'
import { createCodeEditor, getEditorValue, setEditorValue } from './editor.js'
import { formatArduino } from './clang_format.mjs'
import { openPortsDialog } from './jumperless_ports.mjs'

const TAB_FN = 'Wokwi'
const PREFS_KEY = 'wokwi:prefs'

const DEFAULT_SKETCH = 'void setup() {\n  // put your setup code here, to run once:\n\n}\n\nvoid loop() {\n  // put your main code here, to run repeatedly:\n\n}\n'
const DEFAULT_DIAGRAM = {
    version: 1, author: 'JumperIDE', editor: 'wokwi',
    parts: [{ type: 'wokwi-arduino-nano', id: 'nano', top: 0, left: 0, attrs: {} }],
    connections: [], dependencies: {},
}

/** @type {WokwiBridge|null} — kept so the device connection survives tab re-open. */
let bridge = null
/** @type {WokwiEmbed|null} */
let embed = null
/** @type {HTMLElement|null} */
let logEl = null
let refreshUI = () => {}
/** Called when a diagram is pushed to the device (refreshes the inspector). */
let onDiagramPushed = () => {}

function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} }
}
function savePrefs(patch) {
    const next = { ...loadPrefs(), ...patch }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
}
function log(msg, level = '') {
    if (!logEl || !logEl.isConnected) { console.log('[wokwi]', msg); return }
    const line = document.createElement('div')
    line.className = 'wk-log-line' + (level ? ` wk-${level}` : '')
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
    logEl.appendChild(line)
    logEl.scrollTop = logEl.scrollHeight
}
function ensureBridge() {
    if (!bridge) bridge = new WokwiBridge({ log, onStatus: (s) => { refreshUI(); if (s === 'pushed') onDiagramPushed() } })
    return bridge
}
function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function openWokwiTab() {
    if (displayOpenFile(TAB_FN)) return
    const el = createTab(TAB_FN)
    el.innerHTML = ''
    build(el)
}

function build(root) {
    const prefs = loadPrefs()
    const configured = isConfigured()
    const b = ensureBridge()

    root.classList.add('wk-host')
    root.innerHTML = `
        <div class="wk-root">
            <div class="wk-header">
                <div class="wk-group" title="Seed the editor + simulator from a Wokwi project. The live circuit comes from the simulator on the right, not this field.">
                    <input class="wk-url" type="text" placeholder="Wokwi URL or id…" value="${escapeAttr(prefs.url || '')}">
                    <button type="button" class="wk-btn wk-load" title="Load this project into the editor + simulator"><i class="fa-solid fa-download"></i> Load</button>
                    <button type="button" class="wk-iconbtn wk-open" title="Open this project on wokwi.com"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                    <span class="wk-src-chip" title="Where the current project came from">Local project</span>
                </div>
                <span class="wk-sep"></span>
                <div class="wk-group">
                    <label class="wk-inline">Slot
                        <select class="wk-slot">${[0,1,2,3,4,5,6,7].map(i => `<option value="${i}">${i}</option>`).join('')}</select>
                    </label>
                    <button type="button" class="wk-btn wk-primary wk-sync" title="Connect to the Jumperless and continuously push the live circuit to the selected slot">
                        <i class="fa-solid fa-arrows-rotate"></i> <span class="wk-sync-label">Sync to device</span>
                    </button>
                    <span class="wk-status-dot" title="Not connected"></span>
                </div>
                <span class="wk-spacer"></span>
                <button type="button" class="wk-iconbtn wk-more" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                <div class="wk-menu wk-more-menu" hidden>
                    <button type="button" class="wk-menu-item wk-connect"><i class="fa-solid fa-plug fa-fw"></i> <span class="wk-connect-label">Connect device</span></button>
                    <label class="wk-menu-row" title="How often the live circuit is pushed to the device while syncing">
                        <span><i class="fa-solid fa-arrows-rotate fa-fw"></i> Sync every</span>
                        <input class="wk-interval" type="number" min="1000" step="500" value="${prefs.intervalMs || 3000}"> ms
                    </label>
                    <div class="wk-menu-sep"></div>
                    <button type="button" class="wk-menu-item wk-ports"><i class="fa-solid fa-sliders fa-fw"></i> Configure ports…</button>
                    <button type="button" class="wk-menu-item wk-save"><i class="fa-solid fa-floppy-disk fa-fw"></i> Save to Jumperless…</button>
                    <button type="button" class="wk-menu-item wk-diagram-toggle"><i class="fa-solid fa-code fa-fw"></i> Inspect diagram.json</button>
                    <button type="button" class="wk-menu-item wk-log-toggle"><i class="fa-solid fa-terminal fa-fw"></i> Toggle debug log</button>
                </div>
            </div>
            ${configured ? '' : '<div class="wk-warn">Wokwi proxy not configured. Wiring sync & cloud compile are disabled until the worker is deployed; you can still flash a .hex.</div>'}
            <div class="wk-body">
                <div class="wk-code">
                    <div class="wk-code-bar">
                        <span class="wk-code-title">sketch.ino</span>
                        <span class="wk-spacer"></span>
                        <label class="wk-inline">board
                            <select class="wk-board"><option value="nano">Nano</option><option value="uno">Uno</option></select>
                        </label>
                        <label class="wk-inline">baud
                            <select class="wk-baud"><option value="115200">115200</option><option value="57600">57600 (old)</option></select>
                        </label>
                        <button type="button" class="wk-btn wk-format" title="Reformat the sketch with clang-format"><i class="fa-solid fa-code"></i> Format</button>
                        <button type="button" class="wk-btn wk-sendsim" title="Upload this code to the simulator and run it"><i class="fa-solid fa-play"></i> Run in sim</button>
                        <button type="button" class="wk-btn wk-primary wk-compile" title="Cloud-compile and flash to the Arduino" ${configured ? '' : 'disabled'}><i class="fa-solid fa-microchip"></i> Compile &amp; Flash</button>
                        <button type="button" class="wk-iconbtn wk-import" title="Flash an existing .hex file"><i class="fa-solid fa-download"></i></button>
                        <input type="file" class="wk-file" accept=".hex,.ihex" hidden>
                    </div>
                    <div class="wk-editor"></div>
                </div>
                <div class="wk-divider" title="Drag to resize"></div>
                <div class="wk-sim">
                    <iframe class="wk-frame" title="Wokwi simulator"></iframe>
                </div>
                <div class="wk-diagram-panel wk-diagram-hidden">
                    <div class="wk-diagram-head">
                        <span>diagram.json (live)</span>
                        <span class="wk-spacer"></span>
                        <button type="button" class="wk-btn wk-diagram-refresh" title="Re-read the live diagram from the simulator">Refresh</button>
                        <button type="button" class="wk-btn wk-diagram-copy" title="Copy diagram JSON">Copy</button>
                        <button type="button" class="wk-diagram-close" title="Close">✕</button>
                    </div>
                    <div class="wk-diagram-view"></div>
                </div>
                <div class="wk-log-panel">
                    <div class="wk-log-head">
                        <span>Debug output</span>
                        <span class="wk-spacer"></span>
                        <button type="button" class="wk-log-close" title="Close">✕</button>
                    </div>
                    <div class="wk-log"></div>
                </div>
            </div>
        </div>
    `

    const $ = (s) => root.querySelector(s)
    const urlEl = $('.wk-url'), loadBtn = $('.wk-load'), openBtn = $('.wk-open'), slotEl = $('.wk-slot')
    const srcChip = $('.wk-src-chip')
    const connectBtn = $('.wk-connect'), syncBtn = $('.wk-sync'), intervalEl = $('.wk-interval')
    const syncLabel = $('.wk-sync-label'), connectLabel = $('.wk-connect-label'), statusDot = $('.wk-status-dot')
    const moreBtn = $('.wk-more'), moreMenu = $('.wk-more-menu')
    const saveBtn = $('.wk-save'), logToggleBtn = $('.wk-log-toggle'), portsBtn = $('.wk-ports')
    const boardEl = $('.wk-board'), baudEl = $('.wk-baud'), sendSimBtn = $('.wk-sendsim')
    const formatBtn = $('.wk-format')
    const compileBtn = $('.wk-compile'), importBtn = $('.wk-import'), fileEl = $('.wk-file')
    const editorEl = $('.wk-editor'), frameEl = $('.wk-frame'), dividerEl = $('.wk-divider')
    const bodyEl = $('.wk-body'), codeEl = $('.wk-code'), logCloseBtn = $('.wk-log-close')
    const diagramToggleBtn = $('.wk-diagram-toggle'), diagramCloseBtn = $('.wk-diagram-close')
    const diagramRefreshBtn = $('.wk-diagram-refresh'), diagramCopyBtn = $('.wk-diagram-copy')
    const diagramViewEl = $('.wk-diagram-view')
    logEl = $('.wk-log')

    // CodeMirror editors: Arduino sketch (left pane) + read-only diagram viewer.
    const codeView = createCodeEditor(editorEl, { doc: DEFAULT_SKETCH, language: 'cpp' })
    let diagramView = null

    // Restore prefs
    slotEl.value = String(prefs.slot ?? 0)
    boardEl.value = prefs.board || 'nano'
    baudEl.value = String(prefs.baud || 115200)
    bodyEl.classList.toggle('wk-log-hidden', prefs.logOpen === false)
    if (typeof prefs.splitPct === 'number') codeEl.style.flexBasis = `${prefs.splitPct}%`

    // — link bar source-state chip —
    function updateSourceChip() {
        const id = parseWokwiId(urlEl.value)
        if (id) {
            srcChip.textContent = `From link: ${id}`
            srcChip.classList.add('wk-src-linked')
            openBtn.disabled = false
        } else {
            srcChip.textContent = 'Local project (blank Nano)'
            srcChip.classList.remove('wk-src-linked')
            openBtn.disabled = true
        }
    }
    updateSourceChip()

    if (prefs.url) b.setProject(prefs.url)
    b.setSlot(parseInt(slotEl.value, 10))
    b.setInterval(parseInt(intervalEl.value, 10) || 3000)

    // — embed lifecycle —
    embed = new WokwiEmbed(frameEl, { log })   // sets the iframe src
    b.setEmbed(embed)
    embed.whenConnected().then(() => seedFromUrlOrDefault()).catch(() => {})

    async function seedFromUrlOrDefault() {
        const id = parseWokwiId(urlEl.value)
        if (id) {
            try {
                log('Loading project into the simulator…')
                const project = await fetchProject(id)
                await embed.seed({ diagram: project.diagram, sketch: project.sketch, files: project.files })
                setEditorValue(codeView, project.sketch || DEFAULT_SKETCH)
                log('Loaded. Edit code on the left and the circuit on the right; both sync to the device.', 'ok')
            } catch (e) {
                log(`Could not load project (${e.message}); starting from a blank Nano`, 'warn')
                await embed.seed({ diagram: DEFAULT_DIAGRAM, sketch: getEditorValue(codeView) })
            }
        } else {
            await embed.seed({ diagram: DEFAULT_DIAGRAM, sketch: getEditorValue(codeView) })
            log('Blank Nano ready. Build a circuit on the right, write code on the left.', 'ok')
        }
        updateSourceChip()
    }

    function setLogOpen(open) { bodyEl.classList.toggle('wk-log-hidden', !open); savePrefs({ logOpen: open }) }
    refreshUI = () => {
        syncLabel.textContent = b.syncing ? 'Stop sync' : 'Sync to device'
        syncBtn.classList.toggle('wk-active', b.syncing)
        connectLabel.textContent = b.deviceConnected ? 'Disconnect device' : 'Connect device'
        const state = b.syncing ? 'syncing' : (b.deviceConnected ? 'connected' : 'off')
        statusDot.dataset.state = state
        statusDot.title = state === 'syncing' ? 'Syncing to device' : state === 'connected' ? 'Connected (not syncing)' : 'Not connected'
    }

    // — URL / wokwi link route —
    const applyUrl = () => {
        const id = b.setProject(urlEl.value)
        savePrefs({ url: urlEl.value.trim() })
        updateSourceChip()
        if (urlEl.value.trim() && !id) { log('Could not find a Wokwi project id in that input', 'warn'); return }
        if (embed && embed.connected) seedFromUrlOrDefault()
    }
    urlEl.addEventListener('input', updateSourceChip)
    urlEl.addEventListener('change', applyUrl)
    loadBtn.addEventListener('click', applyUrl)
    openBtn.addEventListener('click', () => {
        const id = parseWokwiId(urlEl.value)
        window.open(id ? idToProjectUrl(id) : 'https://wokwi.com/projects/new/arduino-nano', '_blank', 'noopener')
    })

    // — overflow menu —
    function setMenuOpen(open) {
        moreMenu.hidden = !open
        if (open) setTimeout(() => document.addEventListener('click', closeMenuOnOutside, { capture: true, once: true }), 0)
    }
    function closeMenuOnOutside(e) {
        if (!moreMenu.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) setMenuOpen(false)
        else if (!moreMenu.hidden) setTimeout(() => document.addEventListener('click', closeMenuOnOutside, { capture: true, once: true }), 0)
    }
    moreBtn.addEventListener('click', () => setMenuOpen(moreMenu.hidden))

    // — device + sync —
    slotEl.addEventListener('change', () => { b.setSlot(parseInt(slotEl.value, 10)); savePrefs({ slot: parseInt(slotEl.value, 10) || 0 }) })
    intervalEl.addEventListener('change', () => { b.setInterval(parseInt(intervalEl.value, 10) || 3000); savePrefs({ intervalMs: parseInt(intervalEl.value, 10) || 3000 }) })

    // Primary action: connect (if needed) then sync — pushes immediately.
    syncBtn.addEventListener('click', async () => {
        if (b.syncing) { b.stopSync(); refreshUI(); return }
        try {
            if (!b.deviceConnected) await b.connectDevice()
            b.startSync()   // tick() pushes the current diagram right away
        } catch (e) {
            if (e?.name !== 'NotFoundError') log(`Sync error: ${e.message}`, 'warn')
        }
        refreshUI()
    })

    // Advanced: connect/disconnect only (no sync), from the overflow menu.
    connectBtn.addEventListener('click', async () => {
        setMenuOpen(false)
        try { if (b.deviceConnected) await b.disconnectDevice(); else await b.connectDevice() }
        catch (e) { if (e?.name !== 'NotFoundError') log(`Device error: ${e.message}`, 'warn') }
        refreshUI()
    })

    // — code: run in sim / compile & flash / import hex —
    boardEl.addEventListener('change', () => savePrefs({ board: boardEl.value }))
    baudEl.addEventListener('change', () => savePrefs({ baud: parseInt(baudEl.value, 10) || 115200 }))
    formatBtn.addEventListener('click', async () => {
        formatBtn.disabled = true
        try {
            const formatted = await formatArduino(getEditorValue(codeView))
            setEditorValue(codeView, formatted)
            log('Formatted sketch with clang-format', 'ok')
        } catch (e) { log(`Format error: ${e.message}`, 'warn') }
        finally { formatBtn.disabled = false }
    })
    sendSimBtn.addEventListener('click', async () => {
        try {
            await b.sendSketchToEmbed(getEditorValue(codeView))
            log('Press ▶ in the simulator to compile & run the updated code.')
        } catch (e) { log(e.message, 'warn') }
    })
    compileBtn.addEventListener('click', async () => {
        compileBtn.disabled = true
        try { await b.compileAndFlash({ board: boardEl.value, baudRate: parseInt(baudEl.value, 10), sketch: getEditorValue(codeView) }) }
        catch (e) { if (e?.name !== 'NotFoundError') log(`Compile/flash error: ${e.message}`, 'warn') }
        finally { compileBtn.disabled = false }
    })
    importBtn.addEventListener('click', () => fileEl.click())
    fileEl.addEventListener('change', async () => {
        const file = fileEl.files && fileEl.files[0]
        fileEl.value = ''
        if (!file) return
        try { log(`Flashing ${file.name}…`); await flashHex(await file.text(), { board: boardEl.value, baudRate: parseInt(baudEl.value, 10), log }) }
        catch (e) { if (e?.name !== 'NotFoundError') log(`Flash error: ${e.message}`, 'warn') }
    })

    // — save to Jumperless —
    saveBtn.addEventListener('click', async () => {
        setMenuOpen(false)
        const name = prompt('Save project as (folder name on the Jumperless):', loadPrefs().saveName || 'my_project')
        if (!name) return
        savePrefs({ saveName: name })
        try {
            let diagram = DEFAULT_DIAGRAM
            if (embed && embed.connected) { try { diagram = await embed.getDiagram() } catch (_) {} }
            const readme = wokwiReadme(name)
            const files = [
                { name: 'diagram.json', content: JSON.stringify(diagram, null, 2) },
                { name: 'sketch.ino', content: getEditorValue(codeView) },
                { name: 'README.md', content: readme },
            ]
            const dir = await window.app?.saveWokwiProjectToDevice?.(name, files)
            if (dir) log(`Saved to ${dir} on the Jumperless`, 'ok')
        } catch (e) { log(`Save error: ${e.message}`, 'warn') }
    })

    logToggleBtn.addEventListener('click', () => { setMenuOpen(false); setLogOpen(bodyEl.classList.contains('wk-log-hidden')) })
    logCloseBtn.addEventListener('click', () => setLogOpen(false))

    // — live diagram.json inspector —
    async function refreshDiagram() {
        if (!embed || !embed.connected) { log('Connect the simulator first to read the diagram', 'warn'); return }
        let diagram
        try { diagram = await embed.getDiagram() }
        catch (e) { log(`Could not read diagram (${e.message})`, 'warn'); return }
        const text = JSON.stringify(diagram, null, 2)
        if (!diagramView) diagramView = createCodeEditor(diagramViewEl, { doc: text, language: 'json', readOnly: true })
        else setEditorValue(diagramView, text)
    }
    function setDiagramOpen(open) {
        bodyEl.classList.toggle('wk-diagram-hidden', !open)
        if (open) refreshDiagram()
    }
    diagramToggleBtn.addEventListener('click', () => { setMenuOpen(false); setDiagramOpen(bodyEl.classList.contains('wk-diagram-hidden')) })
    diagramCloseBtn.addEventListener('click', () => setDiagramOpen(false))
    diagramRefreshBtn.addEventListener('click', refreshDiagram)
    diagramCopyBtn.addEventListener('click', async () => {
        if (!diagramView) return
        try { await navigator.clipboard.writeText(getEditorValue(diagramView)); log('Diagram copied', 'ok') }
        catch (e) { log(`Copy failed: ${e.message}`, 'warn') }
    })
    // Auto-refresh the inspector when a sync push happens (if it's open).
    onDiagramPushed = () => { if (!bodyEl.classList.contains('wk-diagram-hidden')) refreshDiagram() }

    // — Jumperless port role override —
    portsBtn.addEventListener('click', () => { setMenuOpen(false); openPortsDialog(log) })

    setupDivider(bodyEl, codeEl, dividerEl)

    refreshUI()
    if (!configured) log('Wiring sync & cloud compile need the worker deployed. The simulator and Flash .hex still work.', 'warn')
}

function wokwiReadme(name) {
    return `# ${name}

Wokwi project exported from JumperIDE.

## Files
- \`diagram.json\` — the circuit (parts + wiring)
- \`sketch.ino\` — the Arduino code

## Open this in Wokwi
1. Go to https://wokwi.com/projects/new/arduino-nano
2. Open the **diagram.json** tab and paste the contents of this folder's diagram.json
3. Open the **Code** tab and paste the contents of sketch.ino
4. Press the play button to simulate (Save to keep it — requires a Wokwi login)
`
}

/** Draggable divider that resizes the code pane (persists split %). */
function setupDivider(bodyEl, codeEl, dividerEl) {
    let dragging = false
    const onMove = (e) => {
        if (!dragging) return
        const rect = bodyEl.getBoundingClientRect()
        let pct = ((e.clientX - rect.left) / rect.width) * 100
        pct = Math.max(20, Math.min(80, pct))
        codeEl.style.flexBasis = `${pct}%`
    }
    const onUp = () => {
        if (!dragging) return
        dragging = false
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        const pct = parseFloat(codeEl.style.flexBasis)
        if (!Number.isNaN(pct)) savePrefs({ splitPct: pct })
    }
    dividerEl.addEventListener('pointerdown', (e) => {
        dragging = true
        e.preventDefault()
        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', onUp)
    })
}

// Clean up when the Wokwi tab closes.
document.addEventListener('tabClosed', (e) => {
    if (e.detail?.fn !== TAB_FN) return
    logEl = null
    refreshUI = () => {}
    onDiagramPushed = () => {}
    if (embed) { embed.destroy(); embed = null; bridge?.setEmbed(null) }
})
