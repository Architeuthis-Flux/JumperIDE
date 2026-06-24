/*
 * Optional floating-windows overlay for JumperIDE (WinBox).
 *
 * A thin wrapper that moves EXISTING panel DOM nodes (file tree, editor, REPL,
 * docs iframe, Wokwi tab) into WinBox windows via mount(), and restores them to
 * their exact original position on close. The flexbox layout stays the default;
 * this overlay is fully reversible (see NodeAnchor + scripts/windows.test.mjs).
 *
 * First step toward broadly window-based tabs/files/docs.
 */

import WinBox from 'winbox/src/js/winbox.js'
import 'winbox/dist/css/winbox.min.css'
import { NodeAnchor } from './window_anchor.mjs'
import { snapZoneToGeometry, pointerSnapZone, tileGeometry } from './window_snap.mjs'

export { NodeAnchor, snapZoneToGeometry, pointerSnapZone, tileGeometry }

const GEOMETRY_KEY = 'windows:geometry'

// ─── Geometry persistence ────────────────────────────────────────────────────

function loadGeometry() {
    try { return JSON.parse(localStorage.getItem(GEOMETRY_KEY)) || {} } catch { return {} }
}
function saveGeometry(all) {
    try { localStorage.setItem(GEOMETRY_KEY, JSON.stringify(all)) } catch { /* ignore */ }
}
function getGeom(key) { return loadGeometry()[key] || null }
function setGeom(key, geom) {
    const all = loadGeometry()
    all[key] = { ...all[key], ...geom }
    saveGeometry(all)
}

// ─── Window registry ─────────────────────────────────────────────────────────

/** @type {Map<string, {win:any, anchor:NodeAnchor}>} */
const openWindows = new Map()

export function isPanelWindowOpen(key) { return openWindows.has(key) }

/**
 * Open (or focus) a floating window that hosts an existing DOM node.
 * @param {string} key stable id (used for geometry persistence + dedup)
 * @param {object} opts
 * @param {string} opts.title window title
 * @param {HTMLElement} opts.node existing node to move into the window
 * @param {number|string} [opts.width]
 * @param {number|string} [opts.height]
 * @param {number|string} [opts.x]
 * @param {number|string} [opts.y]
 * @param {string} [opts.className] extra WinBox class(es)
 * @param {function} [opts.onReflow] called after mount + on resize (refit xterm, etc.)
 * @param {function} [opts.onRestore] called after the node is returned to the DOM on close
 * @returns {any} the WinBox instance
 */
export function openPanelWindow(key, { title, node, width, height, x, y, className = '', onReflow, onRestore } = {}) {
    const existing = openWindows.get(key)
    if (existing) { existing.win.focus(); return existing.win }
    if (!node) throw new Error(`openPanelWindow(${key}): no node`)

    const anchor = new NodeAnchor(node)
    const saved = getGeom(key) || {}

    const reflow = () => { try { onReflow && onReflow() } catch (_) {} }

    const win = new WinBox(title || key, {
        mount: node,
        class: `jl-winbox ${className}`.trim(),
        width: saved.width ?? width ?? '50%',
        height: saved.height ?? height ?? '50%',
        x: saved.x ?? x ?? 'center',
        y: saved.y ?? y ?? 'center',
        onresize: (w, h) => { setGeom(key, { width: w, height: h }); reflow() },
        // NB: look the window up by key (not the `win` const) — WinBox fires
        // onmove during construction, when `win` is still in its TDZ.
        onmove: (mx, my) => { setGeom(key, { x: mx, y: my }); onWindowDragged(key) },
        onclose: () => {
            // Restore the node to its original spot BEFORE WinBox tears down (so
            // it doesn't get auto-unmounted into WinBox's backstore). Returning
            // false lets the close proceed.
            anchor.restore()
            openWindows.delete(key)
            try { onRestore && onRestore(node) } catch (_) {}
            reflow()
            return false
        },
    })

    openWindows.set(key, { win, anchor })
    // Initial reflow once the body has the node + size.
    requestAnimationFrame(reflow)
    return win
}

export function closePanelWindow(key) {
    const entry = openWindows.get(key)
    if (entry) entry.win.close()
}

/** Open if closed, close if open. */
export function togglePanelWindow(key, opts) {
    if (isPanelWindowOpen(key)) { closePanelWindow(key); return false }
    openPanelWindow(key, opts)
    return true
}

/** Close every open panel window (restores all nodes). */
export function closeAllPanelWindows() {
    for (const key of [...openWindows.keys()]) closePanelWindow(key)
}

// ─── "Floating windows" mode (toggle the main panels at once) ────────────────
//
// First step toward broadly window-based tabs/files/docs: the three top-level
// siblings of #container become floating windows. The flexbox layout is the
// default and the mobile/touch fallback; this mode is opt-in.

const reflowAll = () => window.dispatchEvent(new Event('resize'))

const PANELS = [
    { key: 'files', sel: '#side-menu', title: 'Files', defaults: { x: 8, y: 56, width: '24%', height: '85%' } },
    { key: 'editor', sel: '#main-editor', title: 'Editor', onReflow: reflowAll, defaults: { x: '26%', y: 56, width: '46%', height: '85%' } },
    {
        key: 'docs', sel: '#api-ref-panel', title: 'Docs', defaults: { x: '73%', y: 56, width: '25%', height: '85%' },
        // The docs panel is `collapsed` (flex:0) when docked; un-collapse while
        // floating, then re-collapse on restore so the docked layout is unchanged.
        prep: (node) => { node.dataset.wasCollapsed = node.classList.contains('collapsed') ? '1' : '0'; node.classList.remove('collapsed') },
        onRestore: (node) => { if (node.dataset.wasCollapsed === '1') node.classList.add('collapsed'); delete node.dataset.wasCollapsed },
    },
]

let floatingOn = false

/** Floating windows need a pointer + room; keep flexbox on touch/small screens. */
export function isFloatingSupported() {
    if (typeof window === 'undefined') return false
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
    return !coarse && window.innerWidth >= 900
}

export function isFloatingActive() { return floatingOn }

/**
 * Toggle floating-windows mode. Returns the new state (true = floating on).
 * No-op (returns false) on unsupported screens.
 */
export function toggleFloatingMode() {
    if (floatingOn) {
        closeAllPanelWindows()
        floatingOn = false
        reflowAll()
        return false
    }
    if (!isFloatingSupported()) return false
    for (const p of PANELS) {
        const node = document.querySelector(p.sel)
        if (!node) continue
        if (p.prep) p.prep(node)
        openPanelWindow(p.key, {
            title: p.title,
            node,
            ...p.defaults,
            onReflow: p.onReflow,
            onRestore: p.onRestore,
        })
    }
    floatingOn = true
    reflowAll()
    return true
}

// ─── Edge snapping ───────────────────────────────────────────────────────────
//
// WinBox has no snapping. We track the pointer globally; while a window is being
// dragged (onmove fires), we compute the edge/corner zone under the pointer,
// show a preview, and apply the snapped geometry on pointer release.

const TOP_INSET = 48               // leave room for the app toolbar

const _pointer = { x: 0, y: 0 }
let _pointerDown = false
let _snapPreviewEl = null
let _snapArmed = false

if (typeof document !== 'undefined') {
    document.addEventListener('pointermove', (e) => { _pointer.x = e.clientX; _pointer.y = e.clientY }, { passive: true })
    document.addEventListener('pointerdown', () => { _pointerDown = true }, { passive: true, capture: true })
    document.addEventListener('pointerup', () => { _pointerDown = false }, { passive: true, capture: true })
}

function liveViewport() {
    return { x: 0, y: TOP_INSET, width: window.innerWidth, height: window.innerHeight - TOP_INSET }
}

function snapPreviewEl() {
    if (!_snapPreviewEl) {
        _snapPreviewEl = document.createElement('div')
        _snapPreviewEl.className = 'jl-snap-preview'
        _snapPreviewEl.style.display = 'none'
        document.body.appendChild(_snapPreviewEl)
    }
    return _snapPreviewEl
}

function showSnapPreview(geom) {
    const el = snapPreviewEl()
    if (!geom) { el.style.display = 'none'; return }
    el.style.display = 'block'
    el.style.left = `${geom.x}px`
    el.style.top = `${geom.y}px`
    el.style.width = `${geom.width}px`
    el.style.height = `${geom.height}px`
}

/**
 * Called from each window's onmove. Only engages snapping during an actual
 * pointer-driven drag (skips WinBox's construction-time + programmatic moves).
 */
function onWindowDragged(key) {
    if (!_pointerDown) return
    const entry = openWindows.get(key)
    if (!entry) return
    const win = entry.win

    const zone = pointerSnapZone(_pointer.x, _pointer.y, window.innerWidth, window.innerHeight)
    showSnapPreview(snapZoneToGeometry(zone, liveViewport()))

    if (_snapArmed) return
    _snapArmed = true
    const onUp = () => {
        document.removeEventListener('pointerup', onUp, true)
        _snapArmed = false
        showSnapPreview(null)
        const g = snapZoneToGeometry(pointerSnapZone(_pointer.x, _pointer.y, window.innerWidth, window.innerHeight), liveViewport())
        if (g) applyGeometry(win, key, g)
    }
    document.addEventListener('pointerup', onUp, true)
}

function applyGeometry(win, key, g) {
    try {
        win.resize(g.width, g.height).move(g.x, g.y)
        setGeom(key, { x: g.x, y: g.y, width: g.width, height: g.height })
        try { (typeof window.dispatchEvent === 'function') && window.dispatchEvent(new Event('resize')) } catch (_) {}
    } catch (_) { /* ignore */ }
}

// ─── Layout presets ──────────────────────────────────────────────────────────

/**
 * Tile all open panel windows into a preset arrangement.
 * @param {'2up'|'3col'|'grid'} mode
 */
export function applyLayoutPreset(mode) {
    const entries = [...openWindows.entries()]
    if (!entries.length) return
    const cells = tileGeometry(entries.length, mode, liveViewport())
    entries.forEach(([key, { win }], i) => applyGeometry(win, key, cells[i]))
}

const LAYOUT_PRESETS = [
    { id: '2up', label: '2-up (side by side)' },
    { id: '3col', label: '3 columns' },
    { id: 'grid', label: '2×2 grid' },
]

/** Open a small popup menu (anchored to an element) to pick a layout preset. */
export function openLayoutMenu(anchorEl) {
    document.getElementById('jl-layout-menu')?.remove()
    const menu = document.createElement('div')
    menu.id = 'jl-layout-menu'
    menu.className = 'jl-layout-menu'
    menu.innerHTML = LAYOUT_PRESETS.map((p) =>
        `<a class="jl-layout-item" data-mode="${p.id}" href="#">${p.label}</a>`).join('')
    document.body.appendChild(menu)

    const rect = anchorEl ? anchorEl.getBoundingClientRect() : { bottom: 48, left: 8 }
    menu.style.position = 'fixed'
    menu.style.top = `${rect.bottom + 2}px`
    menu.style.left = `${rect.left}px`

    const close = () => menu.remove()
    menu.querySelectorAll('.jl-layout-item').forEach((a) => {
        a.addEventListener('click', (e) => {
            e.preventDefault()
            if (!floatingOn) toggleFloatingMode()
            applyLayoutPreset(a.dataset.mode)
            close()
        })
    })
    setTimeout(() => document.addEventListener('click', function onOut(e) {
        if (!menu.contains(e.target) && e.target !== anchorEl) { close(); document.removeEventListener('click', onOut, true) }
    }, true), 0)
}
