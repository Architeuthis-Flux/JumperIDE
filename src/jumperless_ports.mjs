/*
 * Jumperless serial-port auto-discovery + user override.
 *
 * The Jumperless V5 is a single composite USB device (VID 0x1D50 / PID 0xACAB)
 * exposing four CDC interfaces. Their roles are fixed by the firmware's USB
 * descriptor (JumperlOS/include/usb_interface_config.h), keyed by the USB
 * `bInterfaceNumber` — exposed to Web Serial as `getInfo().usbInterfaceNumber`:
 *
 *   0 = "Jumperless Main"        -> command port (W {slot} {json})
 *   2 = "JL UART Passthrough"    -> Arduino/Serial1, the flash target
 *   4 = "JL Micropython REPL"    -> JumperIDE's main connection
 *   6 = "JL TUI"
 *
 * Why match on the interface number and NEVER on getPorts() array order:
 *   - On Windows, COM port numbers are assigned non-sequentially (COM3, COM11,
 *     …) and Web Serial may return getPorts() in any order. The COM number is
 *     not even exposed. The interface number, however, is stable across
 *     sessions and OSes — so it's the only reliable key.
 *
 * Permission note: Web Serial permission is device-scoped in Chromium. Once any
 * one CDC interface of the device has been granted (the REPL, on first connect),
 * navigator.serial.getPorts() returns ALL of its interfaces without another
 * prompt — so we can silently pick the command + flash ports.
 *
 * User override: the role -> interface map is user-overridable (persisted to
 * localStorage) for the cases where the heuristic can't decide (missing/tied
 * interface metadata, or a user who simply wants a different mapping).
 */

/** USB identity used for picker filters and matching. */
export const JL_USB = { usbVendorId: 0x1D50, usbProductId: 0xACAB }

/** Default role -> interface number map (firmware descriptor order). */
export const JL_IFACE = { command: 0, flash: 2, repl: 4, tui: 6 }

/** Friendly names per interface number (for labels in the picker UI). */
const IFACE_NAMES = {
    0: 'Jumperless Main',
    2: 'JL UART Passthrough',
    4: 'JL Micropython REPL',
    6: 'JL TUI',
}

const ROLE_LABELS = { command: 'Command (W)', flash: 'Flash / UART' }
const LS_KEY = 'jumperless:portRoles'

// ─── Override persistence ────────────────────────────────────────────────────

/** @returns {{command?:number, flash?:number}} */
export function getOverrides() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} }
}
export function setRoleInterface(role, iface) {
    const next = { ...getOverrides(), [role]: iface }
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
}
export function resetOverrides() {
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}

/** Resolve the interface number for a role: override wins over the default. */
export function effectiveInterface(role, overrides = getOverrides()) {
    const v = overrides && overrides[role]
    return Number.isInteger(v) ? v : JL_IFACE[role]
}

// ─── Pure selection helpers (Node-testable; no navigator/DOM) ─────────────────

function safeInfo(port) {
    try { return port.getInfo ? port.getInfo() : {} } catch { return {} }
}
export function matchesJumperless(info) {
    return info && info.usbVendorId === JL_USB.usbVendorId && info.usbProductId === JL_USB.usbProductId
}
/** Annotate + filter a raw port list down to Jumperless ports. */
export function annotate(ports) {
    return (ports || [])
        .map((p) => ({ port: p, info: safeInfo(p) }))
        .filter((x) => matchesJumperless(x.info))
}
/**
 * Select the single port whose interface number matches `iface`. Returns null
 * if zero or more than one match (a tie / undefined metadata is unresolvable
 * by interface and must fall through to the picker) — never an order-based guess.
 */
export function selectByInterface(ports, iface) {
    const matches = annotate(ports).filter((x) => x.info.usbInterfaceNumber === iface)
    return matches.length === 1 ? matches[0].port : null
}
/** Pure: find the granted port for a role within a given port list. */
export function findGrantedPortIn(ports, role, overrides) {
    return selectByInterface(ports, effectiveInterface(role, overrides))
}

// ─── Live discovery (uses navigator.serial) ──────────────────────────────────

/** All granted Jumperless ports, annotated with iface + label. */
export async function listGrantedPorts() {
    let ports = []
    try { ports = await navigator.serial.getPorts() } catch { /* ignore */ }
    return annotate(ports).map(({ port, info }) => ({
        port,
        iface: info.usbInterfaceNumber,
        label: portLabel(info),
    }))
}

/** Friendly label for a port info object. */
export function portLabel(info) {
    const iface = info && info.usbInterfaceNumber
    if (Number.isInteger(iface) && IFACE_NAMES[iface]) return `${IFACE_NAMES[iface]} (iface ${iface})`
    if (Number.isInteger(iface)) return `Jumperless (iface ${iface})`
    return 'Jumperless port'
}

/** Find the granted SerialPort for a role (by interface), or null. */
export async function findGrantedPort(role) {
    let ports = []
    try { ports = await navigator.serial.getPorts() } catch { /* ignore */ }
    return findGrantedPortIn(ports, role)
}

// In-memory per-role cache so a session keeps working even when interface
// metadata is missing (the user picked a specific port via the dialog).
const _sessionPorts = new Map()

/**
 * Get a usable SerialPort for a role, prompting only when necessary.
 * @param {'command'|'flash'} role
 * @param {{prompt?:boolean}} [opts]
 * @returns {Promise<SerialPort|null>}
 */
export async function acquirePort(role, { prompt = true } = {}) {
    // 1) session cache, if it's still present among granted ports
    const cached = _sessionPorts.get(role)
    if (cached) {
        try {
            const ports = await navigator.serial.getPorts()
            if (ports.includes(cached)) return cached
        } catch { /* ignore */ }
        _sessionPorts.delete(role)
    }
    // 2) match by interface number (order-independent)
    const found = await findGrantedPort(role)
    if (found) { _sessionPorts.set(role, found); return found }
    // 3) prompt (filtered to the Jumperless), then re-match
    if (!prompt) return null
    const picked = await navigator.serial.requestPort({ filters: [JL_USB] })
    const after = await findGrantedPort(role)
    const result = after || picked
    _sessionPorts.set(role, result)
    // Remember a working interface for future reloads, when metadata exists.
    try {
        const info = result.getInfo && result.getInfo()
        if (info && Number.isInteger(info.usbInterfaceNumber)) setRoleInterface(role, info.usbInterfaceNumber)
    } catch { /* ignore */ }
    return result
}

// ─── Flash coordination: free a port from terminals during a flash ───────────
//
// A serial terminal holding the Arduino/UART port keeps it open, so the flasher
// can't open it (InvalidStateError). Terminals register a lightweight session
// here; withPortFreed() disconnects any session on the target port, runs the
// flash, then reconnects them.

/** @typedef {{getPort:()=>any, disconnect:()=>Promise<any>|any, reconnect:()=>Promise<any>|any}} SerialSession */
/** @type {Set<SerialSession>} */
const _sessions = new Set()

/** Register a terminal's serial session. Returns an unregister function. */
export function registerSerialSession(session) {
    _sessions.add(session)
    return () => _sessions.delete(session)
}

/** True when two port infos point at the same device endpoint (VID/PID + iface). */
function sameEndpoint(a, b) {
    return a && b
        && a.usbVendorId === b.usbVendorId
        && a.usbProductId === b.usbProductId
        && a.usbInterfaceNumber != null
        && a.usbInterfaceNumber === b.usbInterfaceNumber
}

/**
 * Run `fn` with `targetPort` freed from any terminal that holds it; reconnect
 * those terminals afterward. Matches by object identity or VID/PID+interface.
 * @template T
 * @param {any} targetPort
 * @param {() => Promise<T>|T} fn
 * @returns {Promise<T>}
 */
export async function withPortFreed(targetPort, fn) {
    if (!targetPort) return fn()
    const tInfo = safeInfo(targetPort)
    const freed = []
    for (const s of _sessions) {
        let p = null
        try { p = s.getPort && s.getPort() } catch { p = null }
        if (!p) continue
        if (p === targetPort || sameEndpoint(safeInfo(p), tInfo)) {
            try { await s.disconnect(); freed.push(s) } catch { /* ignore */ }
        }
    }
    try {
        return await fn()
    } finally {
        for (const s of freed) { try { await s.reconnect() } catch { /* ignore */ } }
    }
}

// ─── Override dialog (DOM; only touched when called) ──────────────────────────

/**
 * Open the "Jumperless ports" role-assignment dialog. Lets the user assign which
 * interface is the Command and Flash port, grant more device ports, or reset to
 * the automatic mapping.
 * @param {(msg:string, level?:string)=>void} [log]
 */
export async function openPortsDialog(log = () => {}) {
    document.getElementById('jl-ports-dialog')?.remove()

    const overlay = document.createElement('div')
    overlay.id = 'jl-ports-dialog'
    overlay.className = 'jl-ports-overlay'
    overlay.innerHTML = `
        <div class="jl-ports-panel">
            <div class="jl-ports-head">
                <span>Jumperless ports</span>
                <button type="button" class="jl-ports-close" title="Close">✕</button>
            </div>
            <p class="jl-ports-note">
                Ports are matched by USB interface number (stable across reboots and
                independent of Windows COM ordering). Override here if the wrong port is chosen.
            </p>
            <div class="jl-ports-list"></div>
            <div class="jl-ports-roles"></div>
            <div class="jl-ports-actions">
                <button type="button" class="wk-btn jl-ports-pick">Pick port…</button>
                <button type="button" class="wk-btn jl-ports-reset">Reset to auto</button>
                <span style="flex:1 1 auto"></span>
                <button type="button" class="wk-btn jl-ports-done">Done</button>
            </div>
        </div>
    `
    document.body.appendChild(overlay)

    const listEl = overlay.querySelector('.jl-ports-list')
    const rolesEl = overlay.querySelector('.jl-ports-roles')

    async function render() {
        const granted = await listGrantedPorts()
        const overrides = getOverrides()

        listEl.innerHTML = granted.length
            ? `<div class="jl-ports-list-title">Granted ports</div>` + granted.map((g) =>
                `<div class="jl-ports-row">${escapeHtml(g.label)}</div>`).join('')
            : `<div class="jl-ports-empty">No Jumperless ports granted yet. Click “Pick port…”.</div>`

        // Build option set from known interfaces + any granted interfaces.
        const ifaces = new Set(Object.values(JL_IFACE))
        granted.forEach((g) => { if (Number.isInteger(g.iface)) ifaces.add(g.iface) })
        const ifaceOpts = [...ifaces].sort((a, b) => a - b)

        rolesEl.innerHTML = Object.keys(ROLE_LABELS).map((role) => {
            const eff = effectiveInterface(role, overrides)
            const opts = ifaceOpts.map((i) =>
                `<option value="${i}" ${i === eff ? 'selected' : ''}>${escapeHtml(IFACE_NAMES[i] || `iface ${i}`)} (iface ${i})</option>`
            ).join('')
            const auto = overrides[role] === undefined ? ' (auto)' : ''
            return `<label class="jl-ports-role">
                <span>${ROLE_LABELS[role]}${auto}</span>
                <select class="jl-ports-select" data-role="${role}">${opts}</select>
            </label>`
        }).join('')

        rolesEl.querySelectorAll('.jl-ports-select').forEach((sel) => {
            sel.addEventListener('change', () => {
                setRoleInterface(sel.dataset.role, parseInt(sel.value, 10))
                log(`Set ${ROLE_LABELS[sel.dataset.role]} port to interface ${sel.value}`, 'ok')
                render()
            })
        })
    }

    overlay.querySelector('.jl-ports-pick').addEventListener('click', async () => {
        try { await navigator.serial.requestPort({ filters: [JL_USB] }); render() }
        catch (e) { if (e?.name !== 'NotFoundError') log(`Port pick failed: ${e.message}`, 'warn') }
    })
    overlay.querySelector('.jl-ports-reset').addEventListener('click', () => {
        resetOverrides(); log('Reset Jumperless port mapping to auto', 'ok'); render()
    })
    const close = () => overlay.remove()
    overlay.querySelector('.jl-ports-close').addEventListener('click', close)
    overlay.querySelector('.jl-ports-done').addEventListener('click', close)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

    render()
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
