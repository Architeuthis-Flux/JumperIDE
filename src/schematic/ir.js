/*
 * SPDX-License-Identifier: MIT
 *
 * Intermediate representation for the Schematic Export panel.
 *
 * A Jumperless reports *nets* -- which breadboard rows, rails and header pins its
 * crossbar has tied together. It has no idea what is physically plugged in: a
 * resistor bridging two rows is invisible to the firmware. So the user declares the
 * parts, and this module holds both halves and joins them.
 *
 * The load-bearing decision here: **a part pin binds to a node, never to a net.**
 * Net numbers are ephemeral -- the firmware renumbers them the moment a jumper
 * moves. Breadboard rows are physically stable. So a part records where its pins
 * sit, and the net is derived from the newest capture. Re-capture then costs
 * nothing: the bindings simply re-resolve.
 *
 * Pure module: no DOM, no imports from app.js (which would be a circular import and
 * fail the build).
 */

export const PROJECT_KIND = 'jumperide-schematic'
export const SCHEMA_VERSION = 1

/* ------------------------------------------------------------------ node names */

/*
 * Short node names as they appear in get_state() JSON, transcribed from
 * JumperlOS/src/routing/NetManager.cpp:98-211. `kind` is ours, not the firmware's.
 */
const NODE_TABLE = [
    // [short, long, number, kind]
    ['GND',     'GND',          100, 'gnd'],
    ['TOP_GND', 'TOP_GND',      104, 'gnd'],
    ['BOT_GND', 'BOTTOM_GND',   126, 'gnd'],
    ['N_GND0',  'NANO_N_GND0',   97, 'gnd'],
    ['N_GND1',  'NANO_N_GND1',   96, 'gnd'],
    ['TOP_R',   'TOP_RAIL',     101, 'rail'],
    ['BOT_R',   'BOTTOM_RAIL',  102, 'rail'],
    ['3V3',     'SUPPLY_3V3',   103, 'supply'],
    ['5V',      'SUPPLY_5V',    105, 'supply'],
    ['8V_P',    '8V_POS',       120, 'supply'],
    ['8V_N',    '8V_NEG',       121, 'supply'],
    ['VIN',     'NANO_VIN',      69, 'supply'],
    ['NANO_3V3','NANO_3V3',      98, 'supply'],
    ['NANO_5V', 'NANO_5V',       99, 'supply'],
    ['DAC_0',   'DAC0',         106, 'dac'],
    ['DAC_1',   'DAC1',         107, 'dac'],
    ['I_POS',   'ISENSE_PLUS',  108, 'measure'],
    ['I_NEG',   'ISENSE_MINUS', 109, 'measure'],
    ['ADC_0',   'ADC0',         110, 'measure'],
    ['ADC_1',   'ADC1',         111, 'measure'],
    ['ADC_2',   'ADC2',         112, 'measure'],
    ['ADC_3',   'ADC3',         113, 'measure'],
    ['ADC_4',   'ADC4',         114, 'measure'],
    ['ADC_7',   'ADC7',         115, 'measure'],
    ['UART_Tx', 'RP_UART_Tx',   116, 'mcu'],
    ['UART_Rx', 'RP_UART_Rx',   117, 'mcu'],
    ['GP_18',   'RP_GPIO_18',   118, 'mcu'],
    ['GP_19',   'RP_GPIO_19',   119, 'mcu'],
    ['AREF',    'NANO_AREF',     85, 'mcu'],
    ['RST0',    'NANO_RST0',     94, 'mcu'],
    ['RST1',    'NANO_RST1',     95, 'mcu'],
]
for (let i = 1; i <= 8; i++)  { NODE_TABLE.push([`GP_${i}`, `RP_GPIO_${i}`, 130 + i, 'mcu']) }
for (let i = 0; i <= 13; i++) { NODE_TABLE.push([`D${i}`,   `NANO_D${i}`,    70 + i, 'mcu']) }
for (let i = 0; i <= 7; i++)  { NODE_TABLE.push([`A${i}`,   `NANO_A${i}`,    86 + i, 'mcu']) }

const NODE_BY_NAME = new Map()
for (const [short, long, num, kind] of NODE_TABLE) {
    const info = { short, long, num, kind }
    NODE_BY_NAME.set(short.toUpperCase(), info)
    NODE_BY_NAME.set(long.toUpperCase(), info)
}

export const TOP_ROWS = 30
export const TOTAL_ROWS = 60

/** Node name -> {short, long, num, kind}, or a synthesised row/unknown descriptor. */
export function nodeInfo(name) {
    const key = String(name ?? '').trim()
    if (!key) { return null }
    const row = rowNumber(key)
    if (row !== null) {
        return { short: key, long: `ROW_${row}`, num: row, kind: 'row', row }
    }
    return NODE_BY_NAME.get(key.toUpperCase()) || { short: key, long: key, num: null, kind: 'other' }
}

export function nodeKind(name) {
    return nodeInfo(name)?.kind ?? 'other'
}

/** "23" -> 23 for real breadboard rows; null for everything else. */
export function rowNumber(name) {
    const s = String(name ?? '').trim()
    if (!/^\d+$/.test(s)) { return null }
    const n = parseInt(s, 10)
    return (n >= 1 && n <= TOTAL_ROWS) ? n : null
}

/** Row directly across the centre channel. Rows 1-30 are the top half, 31-60 the bottom. */
export function mirrorRow(row) {
    return row <= TOP_ROWS ? row + TOP_ROWS : row - TOP_ROWS
}

/** Human label for a node, e.g. "row 23" or "GND". */
export function nodeLabel(name) {
    const row = rowNumber(name)
    return row === null ? String(name) : `row ${row}`
}

/* ------------------------------------------------------------------- capture */

/**
 * Tolerant parse of a get_state() payload. Accepts an already-parsed object, or raw
 * REPL output with banner/status noise around the JSON.
 */
export function parseCapture(input) {
    if (input && typeof input === 'object') { return validateCapture(input) }

    const text = String(input ?? '')
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) {
        throw new Error('No JSON object found in the captured text')
    }
    let obj
    try {
        obj = JSON.parse(text.slice(start, end + 1))
    } catch (err) {
        throw new Error(`Could not parse board state as JSON: ${err.message}`)
    }
    return validateCapture(obj)
}

function validateCapture(obj) {
    if (!obj || typeof obj !== 'object') { throw new Error('Board state is not an object') }
    if (!Array.isArray(obj.nets)) {
        throw new Error('Board state has no "nets" array -- is this get_state() output?')
    }
    return {
        power: obj.power && typeof obj.power === 'object' ? obj.power : {},
        nets: obj.nets.map(normaliseNet).filter(Boolean),
        gpio: Array.isArray(obj.gpio) ? obj.gpio : [],
        overlays: Array.isArray(obj.overlays) ? obj.overlays : [],
    }
}

function normaliseNet(net, i) {
    if (!net || typeof net !== 'object') { return null }
    const nodes = Array.isArray(net.nodes) ? net.nodes.map(n => String(n).trim()).filter(Boolean) : []

    /*
     * A net holding a single node connects nothing. The firmware reserves nets 1-5 for
     * GND, the two rails and the two DACs, each seeded with just its own node whether
     * or not anything is attached -- so without this every capture carried phantom
     * supplies and an empty GND net alongside the real one.
     *
     * Newer firmware omits these at the source; the filter stays because JumperIDE
     * talks to boards it did not ship with. Rail and DAC voltages come from the
     * "power" block regardless, so nothing is lost.
     */
    if (nodes.length < 2) { return null }
    return {
        index: Number.isFinite(net.index) ? net.index : i + 1,
        name: typeof net.name === 'string' ? net.name.trim() : '',
        nodes,
        special: typeof net.special === 'string' ? net.special : 'none',
        voltage: Number.isFinite(net.voltage) ? net.voltage : null,
        logic: Number.isFinite(net.logic) ? net.logic : null,
    }
}

/* -------------------------------------------------------- net classification */

/*
 * Deliberately derived from node membership rather than the capture's own `special`
 * field: JsonState.cpp:142-212 overwrites specialType with the *last* matching node,
 * so a net holding both GND and ADC_0 reports "ADC".
 */
const KIND_PRIORITY = ['gnd', 'rail', 'supply', 'dac', 'mcu', 'measure', 'row', 'other']

export function classifyNet(net) {
    let best = 'signal'
    let bestRank = Infinity
    for (const node of net.nodes) {
        const kind = nodeKind(node)
        if (kind === 'row' || kind === 'other') { continue }
        const rank = KIND_PRIORITY.indexOf(kind)
        if (rank >= 0 && rank < bestRank) { bestRank = rank; best = kind }
    }
    return best
}

/** Sorted node list -- the identity of a net for cross-capture matching. */
export function netSignature(net) {
    return [...net.nodes].sort()
}

/**
 * The most stable symbolic node in a net, used both to match annotations across
 * captures and as the representative node written when a user picks a net for a pin.
 */
export function netAnchor(net) {
    let best = null
    let bestRank = Infinity
    for (const node of net.nodes) {
        const kind = nodeKind(node)
        if (kind === 'row' || kind === 'other') { continue }
        const rank = KIND_PRIORITY.indexOf(kind)
        if (rank >= 0 && rank < bestRank) { bestRank = rank; best = node }
    }
    return best
}

/** Representative node for a net: its anchor, else its lowest row, else first node. */
export function netRepresentativeNode(net) {
    const anchor = netAnchor(net)
    if (anchor) { return anchor }
    const rows = net.nodes.map(rowNumber).filter(r => r !== null).sort((a, b) => a - b)
    return rows.length ? String(rows[0]) : net.nodes[0]
}

/*
 * Names the firmware hands out on its own. They look like user intent but are not,
 * so they lose to a canonical power name -- otherwise the rail a board calls
 * "Top Rail" would never line up with the +3V3 symbol that belongs on it.
 */
const FIRMWARE_DEFAULT_NAME = /^(net\s*\d+|top\s*rail|bottom\s*rail|gnd|ground|empty)?$/i

/**
 * The name a power net should carry: GND, +3V3, +5V and friends. Both exporters
 * derive power symbols from this same function, so the symbol and the net label
 * always agree -- if they disagree, KiCad quietly renames the net to whatever the
 * power symbol says and the netlist stops matching the parts table.
 *
 * Returns null for nets that are not power.
 */
export function canonicalPowerName(net, kind, power) {
    const k = kind || classifyNet(net)
    if (k === 'gnd') { return 'GND' }
    if (k !== 'rail' && k !== 'supply' && k !== 'dac') { return null }

    // A net does not always carry its own voltage: the piecewise capture path has no
    // per-net voltage at all, and even get_state() omits it whenever another node in
    // the net wins the `special` field. The board-level power block always knows.
    const v = typeof net.voltage === 'number' ? net.voltage : railVoltage(net, power)
    if (typeof v === 'number' && Math.abs(v) > 0.05) {
        if (Math.abs(v - 3.3) < 0.25) { return '+3V3' }
        if (Math.abs(v - 5.0) < 0.25) { return '+5V' }
        return `+${String(Math.round(v * 100) / 100).replace('.', 'V')}`
    }
    if (net.nodes?.includes('3V3')) { return '+3V3' }
    if (net.nodes?.includes('5V')) { return '+5V' }
    return netAnchor(net)
}

/** Board-level supply reading for whichever rail this net is tied to. */
function railVoltage(net, power) {
    if (!power || !net.nodes) { return null }
    const map = { TOP_R: 'top_rail', BOT_R: 'bottom_rail', DAC_0: 'dac0', DAC_1: 'dac1' }
    for (const node of net.nodes) {
        const key = map[String(node).toUpperCase()]
        if (key && typeof power[key] === 'number') { return power[key] }
    }
    return null
}

export function defaultNetName(net, kind, boardPower) {
    if (net.name && !FIRMWARE_DEFAULT_NAME.test(net.name.trim())) { return net.name }
    const power = canonicalPowerName(net, kind, boardPower)
    if (power) { return power }
    const anchor = netAnchor(net)
    if (anchor) { return anchor }
    return `N$${net.index}`
}

/* ------------------------------------------------- annotation re-matching */

function jaccard(a, b) {
    const sa = new Set(a)
    const sb = new Set(b)
    let inter = 0
    for (const x of sa) { if (sb.has(x)) { inter++ } }
    const union = sa.size + sb.size - inter
    return union === 0 ? 0 : inter / union
}

/**
 * Carry user-supplied net names across a re-capture. Parts never participate in
 * this -- they bind to nodes -- so a bad match costs a label, never a connection.
 *
 * Returns { identity: [{netId, signature, anchor, index, confidence}], orphans: [] }.
 */
export function matchNets(oldIdentity, newNets) {
    const old = (oldIdentity || []).map(e => ({ ...e, taken: false }))
    const identity = new Array(newNets.length).fill(null)

    const assign = (i, entry, confidence) => {
        entry.taken = true
        identity[i] = {
            netId: entry.netId,
            signature: netSignature(newNets[i]),
            anchor: netAnchor(newNets[i]),
            index: newNets[i].index,
            confidence,
        }
    }

    // 1. exact node-set match
    newNets.forEach((net, i) => {
        if (identity[i]) { return }
        const sig = netSignature(net).join(' ')
        const hit = old.find(e => !e.taken && (e.signature || []).join(' ') === sig)
        if (hit) { assign(i, hit, 'exact') }
    })

    // 2. same symbolic anchor -- what makes "the ground net" survive rewiring
    newNets.forEach((net, i) => {
        if (identity[i]) { return }
        const anchor = netAnchor(net)
        if (!anchor) { return }
        const hit = old.find(e => !e.taken && e.anchor === anchor)
        if (hit) { assign(i, hit, 'anchor') }
    })

    // 3. best-scoring node-set overlap, each old net consumed at most once
    const candidates = []
    newNets.forEach((net, i) => {
        if (identity[i]) { return }
        const sig = netSignature(net)
        old.forEach(entry => {
            if (entry.taken) { return }
            const score = jaccard(sig, entry.signature || [])
            if (score >= 0.5) { candidates.push({ i, entry, score }) }
        })
    })
    candidates.sort((a, b) => b.score - a.score)
    for (const c of candidates) {
        if (identity[c.i] || c.entry.taken) { continue }
        assign(c.i, c.entry, 'fuzzy')
    }

    // 4. anything left is new
    newNets.forEach((net, i) => {
        if (identity[i]) { return }
        identity[i] = {
            netId: makeId('n'),
            signature: netSignature(net),
            anchor: netAnchor(net),
            index: net.index,
            confidence: 'new',
        }
    })

    const matched = new Set(identity.map(e => e.netId))
    const orphans = old
        .filter(e => !matched.has(e.netId))
        .map(e => ({ netId: e.netId, lastSignature: e.signature, anchor: e.anchor }))

    return { identity, orphans }
}

/* ------------------------------------------------------------- part catalog */

/**
 * `pins[].n` is the KiCad pin *number*, which for transistors is a letter -- these
 * are read straight off the stock symbols (Device:Q_NPN numbers its pins B/C/E, and
 * Device:LED numbers the cathode "1"). Getting these wrong produces a schematic that
 * looks right and nets wrong, so they are verified against the symbol bodies in
 * src/kicad_symbols.js.
 *
 * `falstad.posts` maps CircuitJS post order onto our pin numbers.
 */
export const PART_TYPES = {
    R: {
        label: 'Resistor', refPrefix: 'R', value: '10k', kicad: 'Device:R',
        pins: [{ n: '1' }, { n: '2' }],
        falstad: { type: 'r', posts: ['1', '2'], unit: 'ohm', dflt: 1000 },
    },
    C: {
        label: 'Capacitor', refPrefix: 'C', value: '100n', kicad: 'Device:C',
        pins: [{ n: '1' }, { n: '2' }],
        falstad: { type: 'c', posts: ['1', '2'], unit: 'farad', dflt: 1e-7, extra: '0 0' },
    },
    CP: {
        label: 'Capacitor (polarized)', refPrefix: 'C', value: '10u', kicad: 'Device:C_Polarized',
        pins: [{ n: '1', name: '+' }, { n: '2', name: '-' }],
        falstad: { type: '209', posts: ['1', '2'], unit: 'farad', dflt: 1e-5, extra: '0 0' },
    },
    L: {
        label: 'Inductor', refPrefix: 'L', value: '10u', kicad: 'Device:L',
        pins: [{ n: '1' }, { n: '2' }],
        falstad: { type: 'l', posts: ['1', '2'], unit: 'henry', dflt: 1e-5, extra: '0' },
    },
    D: {
        label: 'Diode', refPrefix: 'D', value: '1N4148', kicad: 'Device:D',
        pins: [{ n: '2', name: 'A' }, { n: '1', name: 'K' }],
        falstad: { type: 'd', posts: ['2', '1'], model: 'default' },
    },
    LED: {
        label: 'LED', refPrefix: 'D', value: 'LED', kicad: 'Device:LED',
        pins: [{ n: '2', name: 'A' }, { n: '1', name: 'K' }],
        falstad: { type: '162', posts: ['2', '1'], model: 'default-led', extra: '1 0 0 0.01' },
    },
    ZENER: {
        label: 'Zener diode', refPrefix: 'D', value: '5V1', kicad: 'Device:D_Zener',
        pins: [{ n: '2', name: 'A' }, { n: '1', name: 'K' }],
        falstad: { type: 'z', posts: ['2', '1'], model: 'default-zener' },
    },
    NPN: {
        label: 'NPN transistor', refPrefix: 'Q', value: '2N3904', kicad: 'Device:Q_NPN',
        pins: [{ n: 'B' }, { n: 'C' }, { n: 'E' }],
        falstad: { type: 't', posts: ['B', 'C', 'E'], extra: '-1 0 0 100 default' },
    },
    PNP: {
        label: 'PNP transistor', refPrefix: 'Q', value: '2N3906', kicad: 'Device:Q_PNP',
        pins: [{ n: 'B' }, { n: 'C' }, { n: 'E' }],
        falstad: { type: 't', posts: ['B', 'C', 'E'], extra: '1 0 0 100 default' },
    },
    NMOS: {
        label: 'N-channel MOSFET', refPrefix: 'Q', value: '2N7000', kicad: 'Device:Q_NMOS',
        pins: [{ n: 'G' }, { n: 'D' }, { n: 'S' }],
        falstad: null,   // MosfetElm derives its posts; see export_falstad.js
    },
    POT: {
        label: 'Potentiometer', refPrefix: 'RV', value: '10k', kicad: 'Device:R_Potentiometer',
        pins: [{ n: '1' }, { n: '2', name: 'wiper' }, { n: '3' }],
        falstad: null,   // PotElm derives its posts; see export_falstad.js
    },
    SW: {
        label: 'Push button', refPrefix: 'SW', value: 'SW_Push', kicad: 'Switch:SW_Push',
        pins: [{ n: '1' }, { n: '2' }],
        falstad: { type: 's', posts: ['1', '2'], extra: '0 0' },
    },
    SPDT: {
        label: 'SPDT switch', refPrefix: 'SW', value: 'SW_SPDT', kicad: 'Switch:SW_SPDT',
        pins: [{ n: '1', name: 'com' }, { n: '2' }, { n: '3' }],
        falstad: null,   // Switch2Elm derives its posts; see export_falstad.js
    },
    XTAL: {
        label: 'Crystal', refPrefix: 'Y', value: '16MHz', kicad: 'Device:Crystal',
        pins: [{ n: '1' }, { n: '2' }],
        falstad: null,
    },
    DIP: {
        label: 'DIP chip', refPrefix: 'U', value: '', kicad: null,
        variablePins: true, defaultPins: 8, dip: true, falstad: null,
    },
    CONN: {
        label: 'Connector / module', refPrefix: 'J', value: '', kicad: null,
        variablePins: true, defaultPins: 4, falstad: null,
    },
}

export function partType(typeId) {
    return PART_TYPES[typeId] || PART_TYPES.R
}

/** Pin numbers for a part, in display order. Variable-pin types number 1..pinCount. */
export function partPins(part) {
    const type = partType(part.typeId)
    if (type.variablePins) {
        const out = []
        for (let i = 1; i <= (part.pinCount || type.defaultPins); i++) { out.push(String(i)) }
        return out
    }
    return type.pins.map(p => p.n)
}

export function partPinName(part, pinNumber) {
    const type = partType(part.typeId)
    if (part.pinLabels && part.pinLabels[pinNumber]) { return part.pinLabels[pinNumber] }
    const def = (type.pins || []).find(p => p.n === pinNumber)
    return def?.name || pinNumber
}

/* --------------------------------------------------------- pin -> node -> net */

/**
 * Where DIP pin `pin` physically sits, given the package spans rows
 * anchorRow..anchorRow+pinCount/2-1 on each side of the centre channel.
 *
 * Pins 1..N/2 run down one half; N/2+1..N run back up the other, so pin N ends up
 * directly across the channel from pin 1 -- the real package's pin order.
 */
export function dipPinNode(anchorRow, pinCount, pin1Half, pin) {
    const n = parseInt(pin, 10)
    const half = Math.floor(pinCount / 2)
    if (!Number.isFinite(n) || n < 1 || n > pinCount || half < 1) { return null }

    const firstSide = n <= half
    const offset = firstSide ? n - 1 : pinCount - n
    const onTop = firstSide === (pin1Half !== 'bottom')

    let row = anchorRow + offset
    if (!onTop) { row += TOP_ROWS }
    if (row < 1 || row > TOTAL_ROWS) { return null }
    return String(row)
}

/** The node a pin sits on: explicit override first, then derived from placement. */
export function pinNode(part, pinNumber) {
    const override = part.pinNodes?.[pinNumber]
    if (override) { return override }
    if (part.placement?.kind === 'dip') {
        return dipPinNode(part.placement.anchorRow, part.pinCount, part.placement.pin1Half, pinNumber)
    }
    return null
}

/**
 * Resolve every pin of a part against a node -> netId map.
 * State is 'bound' | 'floating' | 'nc' | 'unassigned'. `floating` is a perfectly
 * normal resting state -- an unused DIP pin in an otherwise empty row -- not an error.
 */
export function resolvePart(part, netIdByNode) {
    const out = {}
    for (const pin of partPins(part)) {
        const node = pinNode(part, pin)
        if (node === 'NC') { out[pin] = { node: null, netId: null, state: 'nc' }; continue }
        if (!node) { out[pin] = { node: null, netId: null, state: 'unassigned' }; continue }
        const netId = netIdByNode.get(node) || null
        out[pin] = { node, netId, state: netId ? 'bound' : 'floating' }
    }
    return out
}

/* --------------------------------------------------------------- inference */

export function suggestionKey(part) {
    return `dip:${part.placement?.anchorRow}:${part.pinCount}`
}

/**
 * Package sizes worth guessing at, weighted by how often they actually turn up in a
 * parts drawer. The weight matters: the same scattered rows can often be framed by
 * several packages at once, and without a prior the tie goes to whichever window
 * happens to swallow one more row -- so an 8-pin timer gets read as a DIP-18.
 */
const DIP_SIZES = [
    { pins: 8, prior: 1 }, { pins: 14, prior: 1 }, { pins: 16, prior: 1 },
    { pins: 18, prior: 0.85 }, { pins: 20, prior: 1 }, { pins: 24, prior: 0.85 },
    { pins: 28, prior: 1 }, { pins: 40, prior: 1 },
]

/**
 * Guess DIP packages from the shape of the wiring.
 *
 * The tempting heuristic -- look for a contiguous run of used rows -- does not
 * survive contact with real boards: most of a chip's pins are usually unwired (a
 * 74HC595 driving one LED leaves half its outputs floating), so its rows appear as
 * scattered singletons, not a run. What *is* reliable is that the used rows cluster
 * inside one package-sized window and appear on both sides of the centre channel.
 *
 * So: slide every standard package size over the board and score the window by how
 * much of it is in use. Require pins on both halves and a real pin count, so a
 * couple of unrelated resistors can't masquerade as a chip.
 */
export function inferParts(capture, existingParts, rejected) {
    const used = new Set()
    const kindByRow = new Map()
    for (const net of capture.nets) {
        const kind = classifyNet(net)
        for (const node of net.nodes) {
            const row = rowNumber(node)
            if (row !== null) { used.add(row); kindByRow.set(row, kind) }
        }
    }
    const claimed = new Set()
    for (const part of existingParts || []) {
        if (!part.accepted) { continue }
        for (const pin of partPins(part)) {
            const row = rowNumber(pinNode(part, pin))
            if (row !== null) { claimed.add(row <= TOP_ROWS ? row : row - TOP_ROWS) }
        }
    }
    const rejectedSet = new Set(rejected || [])

    const candidates = []
    for (const { pins: pinCount, prior } of DIP_SIZES) {
        const half = pinCount / 2
        for (let a = 1; a + half - 1 <= TOP_ROWS; a++) {
            let topUsed = 0
            let botUsed = 0
            let overlaps = false
            for (let row = a; row < a + half; row++) {
                if (used.has(row)) { topUsed++ }
                if (used.has(row + TOP_ROWS)) { botUsed++ }
                if (claimed.has(row)) { overlaps = true }
            }
            if (overlaps) { continue }

            // Both halves must be in play -- that is what says "straddles the channel".
            if (topUsed < 1 || botUsed < 1) { continue }
            const usedPins = topUsed + botUsed
            if (usedPins < 4) { continue }
            const density = usedPins / pinCount
            if (density < 0.35) { continue }

            // The window has to be snug: a pin at each end, or we are just framing
            // a smaller cluster inside an oversized package.
            const endsUsed = (used.has(a) || used.has(a + TOP_ROWS)) &&
                             (used.has(a + half - 1) || used.has(a + half - 1 + TOP_ROWS))
            if (!endsUsed) { continue }

            // Reward explaining more pins, penalise dead package area: a DIP-8 that
            // covers 4 wired rows should not outrank a DIP-16 that covers 8.
            const base = (usedPins * density) * prior

            // Which way round the chip sits, and often which window is right at all,
            // is settled by where power lands: almost every DIP puts GND and VCC on
            // diagonally opposite corners -- pin N/2 and pin N. Two candidate windows
            // that cover the same rows are otherwise indistinguishable, so this is
            // usually the only thing that breaks the tie.
            let best = { pin1Half: 'top', score: base }
            for (const pin1Half of ['top', 'bottom']) {
                const gndRow = rowNumber(dipPinNode(a, pinCount, pin1Half, String(half)))
                const vccRow = rowNumber(dipPinNode(a, pinCount, pin1Half, String(pinCount)))
                const corners =
                    (kindByRow.get(gndRow) === 'gnd' ? 1 : 0) +
                    (['rail', 'supply'].includes(kindByRow.get(vccRow)) ? 1 : 0)
                const score = base * (corners === 2 ? 1.5 : corners === 1 ? 1.15 : 1)
                if (score > best.score) { best = { pin1Half, score } }
            }

            candidates.push({ anchorRow: a, pinCount, usedPins, density, ...best })
        }
    }

    // Best fit wins, and claims its rows so we do not emit five overlapping guesses
    // for the same chip.
    candidates.sort((x, y) => (y.score - x.score) || (x.pinCount - y.pinCount) || (x.anchorRow - y.anchorRow))

    const taken = new Set()
    const out = []
    for (const c of candidates) {
        const half = c.pinCount / 2
        let clash = false
        for (let row = c.anchorRow; row < c.anchorRow + half; row++) {
            if (taken.has(row)) { clash = true; break }
        }
        if (clash) { continue }

        const part = newPart('DIP', { pinCount: c.pinCount })
        part.placement = { kind: 'dip', anchorRow: c.anchorRow, pin1Half: c.pin1Half }
        part.provenance = 'inferred'
        part.accepted = false
        part.confidence = c.density
        if (rejectedSet.has(suggestionKey(part))) { continue }

        for (let row = c.anchorRow; row < c.anchorRow + half; row++) { taken.add(row) }
        out.push(part)
        if (out.length >= 12) { break }
    }
    return out
}

/* ------------------------------------------------------------- project shape */

let idCounter = 0
function makeId(prefix) {
    idCounter += 1
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}${idCounter.toString(36)}`
}

export function newProject() {
    return {
        kind: PROJECT_KIND,
        schemaVersion: SCHEMA_VERSION,
        savedAt: null,
        meta: { title: 'Untitled circuit', notes: '' },
        capture: null,
        netIdentity: [],
        netAnnotations: {},
        orphanAnnotations: [],
        parts: [],
        rejectedSuggestions: [],
        refCounters: {},
    }
}

export function newPart(typeId, overrides = {}) {
    const type = partType(typeId)
    const pinCount = overrides.pinCount || (type.variablePins ? type.defaultPins : type.pins.length)
    return {
        id: makeId('p'),
        typeId,
        refDes: '',
        value: type.value || '',
        footprint: '',
        pinCount,
        pinLabels: {},
        placement: type.dip ? { kind: 'dip', anchorRow: 1, pin1Half: 'top' } : null,
        pinNodes: {},
        provenance: 'user',
        accepted: true,
        notes: '',
        ...overrides,
    }
}

/** Next unused reference designator for a type, e.g. R1, R2, U1. */
export function nextRefDes(project, typeId) {
    const prefix = partType(typeId).refPrefix
    const taken = new Set(project.parts.map(p => p.refDes))
    let i = 1
    while (taken.has(`${prefix}${i}`)) { i++ }
    return `${prefix}${i}`
}

export function migrateProject(obj) {
    if (!obj || typeof obj !== 'object') { throw new Error('Not a project file') }
    if (obj.kind !== PROJECT_KIND) { throw new Error('Not a JumperIDE schematic project') }
    if (obj.schemaVersion > SCHEMA_VERSION) {
        throw new Error('This project was saved by a newer version of JumperIDE')
    }
    // No migrations yet; the seam exists so v2 has somewhere to live.
    return { ...newProject(), ...obj, schemaVersion: SCHEMA_VERSION }
}

/**
 * Fold a fresh capture into a project, preserving parts verbatim and carrying net
 * names across via matchNets().
 */
export function applyCapture(project, raw, source) {
    const capture = parseCapture(raw)
    const { identity, orphans } = matchNets(project.netIdentity, capture.nets)

    const orphanAnnotations = [...(project.orphanAnnotations || [])]
    for (const orphan of orphans) {
        const annotation = project.netAnnotations?.[orphan.netId]
        if (annotation && annotation.name) {
            orphanAnnotations.push({ ...orphan, ...annotation })
        }
    }

    return {
        ...project,
        capture: { at: new Date().toISOString(), source, raw: capture },
        netIdentity: identity,
        orphanAnnotations,
    }
}

/* ------------------------------------------------------- model for exporters */

/**
 * Flatten a project into what the exporters consume: nets with stable ids and
 * resolved names, and parts whose pins each carry their node and net.
 *
 * Synthesises nets for nodes the board never reported. The firmware only knows about
 * rows its crossbar touched, so two component legs sharing an un-jumpered row look
 * like nothing at all -- but they are genuinely the same electrical node, and a
 * schematic that dropped that connection would be wrong.
 */
export function buildModel(project) {
    const capture = project.capture?.raw
    const nets = []
    const netIdByNode = new Map()

    if (capture) {
        capture.nets.forEach((net, i) => {
            const id = project.netIdentity?.[i]?.netId || makeId('n')
            const annotation = project.netAnnotations?.[id]
            const kind = classifyNet(net)
            nets.push({
                id,
                index: net.index,
                name: annotation?.name || defaultNetName(net, kind, capture.power),
                canonicalPower: canonicalPowerName(net, kind, capture.power),
                kind,
                nodes: net.nodes,
                // Resolved, not raw: exporters emit a real voltage source for rails,
                // and a supply that is named +3V3 but simulates at 5 V is worse than
                // no supply at all.
                voltage: typeof net.voltage === 'number' ? net.voltage : railVoltage(net, capture.power),
                logic: net.logic,
                synthetic: false,
                confidence: project.netIdentity?.[i]?.confidence || 'new',
            })
            for (const node of net.nodes) { netIdByNode.set(node, id) }
        })
    }

    const parts = (project.parts || []).filter(p => p.accepted !== false)

    // Count how many pins sit on each un-reported node. Two legs in the same row are
    // a real connection the board never saw; a single leg is just a dangling pin, and
    // inventing a net for it would litter the schematic with stubs going nowhere.
    const pinsPerNode = new Map()
    for (const part of parts) {
        for (const pin of partPins(part)) {
            const node = pinNode(part, pin)
            if (!node || node === 'NC' || netIdByNode.has(node)) { continue }
            pinsPerNode.set(node, (pinsPerNode.get(node) || 0) + 1)
        }
    }

    for (const part of parts) {
        for (const pin of partPins(part)) {
            const node = pinNode(part, pin)
            if (!node || node === 'NC' || netIdByNode.has(node)) { continue }
            if (pinsPerNode.get(node) < 2) { continue }
            const id = makeId('s')
            const synthetic = {
                id,
                index: null,
                name: nodeInfo(node)?.kind === 'row' ? `ROW${rowNumber(node)}` : String(node),
                kind: nodeKind(node) === 'row' ? 'signal' : nodeKind(node),
                nodes: [node],
                voltage: null,
                logic: null,
                synthetic: true,
                confidence: 'new',
            }
            nets.push(synthetic)
            netIdByNode.set(node, id)
        }
    }

    dedupeNetNames(nets)

    const modelParts = [...parts, ...headerParts(nets, parts)].map(part => {
        const resolved = resolvePart(part, netIdByNode)
        return {
            id: part.id,
            typeId: part.typeId,
            refDes: part.refDes || '?',
            value: part.value || '',
            footprint: part.footprint || '',
            pinCount: part.pinCount,
            provenance: part.provenance,
            pins: partPins(part).map(n => ({
                number: n,
                name: partPinName(part, n),
                ...resolved[n],
            })),
        }
    })

    return {
        title: project.meta?.title || 'Untitled circuit',
        power: capture?.power || {},
        nets,
        netById: new Map(nets.map(n => [n.id, n])),
        netIdByNode,
        parts: modelParts,
    }
}

/*
 * Order the header's pins the way the silkscreen does, so the connector reads like
 * the board rather than like a hash table.
 */
const HEADER_ORDER = ['mcu', 'measure', 'dac']

function headerRank(node) {
    const m = String(node).match(/^([A-Za-z_]+)_?(\d+)$/)
    const prefix = m ? m[1] : String(node)
    const index = m ? parseInt(m[2], 10) : 0
    const groups = ['D', 'A', 'GP', 'ADC', 'DAC', 'UART']
    const g = groups.indexOf(prefix)
    return [(g < 0 ? groups.length : g), index, String(node)]
}

/**
 * Every net touching a D0-D13 / A0-A7 / GP_n / ADC_n pin is physically wired to the
 * Jumperless header -- that is a fact the netlist states, not a guess -- so it gets
 * a connector to land on. Without it those nets dangle off a single component pin,
 * which reads as an unfinished schematic and trips ERC's isolated-label check.
 */
function headerParts(nets, existingParts) {
    const pins = []
    for (const net of nets) {
        if (!HEADER_ORDER.includes(net.kind)) { continue }
        const node = net.nodes.find(n => HEADER_ORDER.includes(nodeKind(n)))
        if (!node) { continue }
        pins.push({ node, netId: net.id })
    }
    if (!pins.length) { return [] }

    pins.sort((a, b) => {
        const ra = headerRank(a.node)
        const rb = headerRank(b.node)
        return (ra[0] - rb[0]) || (ra[1] - rb[1]) || String(ra[2]).localeCompare(String(rb[2]))
    })

    const taken = new Set((existingParts || []).map(p => p.refDes))
    let i = 1
    while (taken.has(`J${i}`)) { i++ }

    const part = newPart('CONN', {
        refDes: `J${i}`,
        value: 'Jumperless',
        pinCount: pins.length,
        provenance: 'derived',
    })
    part.pinLabels = {}
    part.pinNodes = {}
    pins.forEach((p, idx) => {
        part.pinLabels[String(idx + 1)] = p.node
        part.pinNodes[String(idx + 1)] = p.node
    })
    return [part]
}

function dedupeNetNames(nets) {
    const taken = new Set()
    for (const net of nets) {
        let name = net.name || 'NET'
        if (taken.has(name)) {
            /*
             * Two nets can legitimately canonicalise to the same name: the board has
             * several distinct ground nodes -- GND, TOP_GND, BOT_GND, the Nano's two
             * -- and each is its own net until something ties them together. Name the
             * duplicate after the node that actually distinguishes it rather than
             * appending a number that tells the reader nothing.
             */
            const anchor = netAnchor(net)
            if (anchor && !taken.has(anchor)) {
                name = anchor
            } else {
                let n = 2
                while (taken.has(`${name}_${n}`)) { n++ }
                name = `${name}_${n}`
            }
        }
        net.name = name
        taken.add(name)
    }
}

/* ------------------------------------------------------------ value parsing */

const SI_SUFFIX = {
    p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3,
    k: 1e3, K: 1e3, M: 1e6, G: 1e9, R: 1, r: 1,
}

/**
 * "10k" -> 10000, "4u7" -> 4.7e-6, "100n" -> 1e-7, "2M2" -> 2.2e6.
 * Returns null when there is no number to find, so callers can fall back to a
 * part-type default rather than emitting NaN into a simulation file.
 */
export function parseEngValue(text) {
    const s = String(text ?? '').trim().replace(/[ΩFH]|ohms?|farads?|henries|henry/gi, '').trim()
    if (!s) { return null }

    // infix form: 4u7, 2M2, 1R5
    const infix = s.match(/^(\d+)([pnuµmkKMGRr])(\d+)$/)
    if (infix) {
        const mult = SI_SUFFIX[infix[2]]
        return parseFloat(`${infix[1]}.${infix[3]}`) * mult
    }

    const m = s.match(/^([-+]?[\d.]+(?:[eE][-+]?\d+)?)\s*([pnuµmkKMGRr]?)/)
    if (!m || !m[1] || isNaN(parseFloat(m[1]))) { return null }
    const mult = m[2] ? (SI_SUFFIX[m[2]] ?? 1) : 1
    return parseFloat(m[1]) * mult
}
