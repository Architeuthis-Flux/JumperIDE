/*
 * SPDX-License-Identifier: MIT
 *
 * Falstad CircuitJS exporter.
 *
 * The file format is one element per line:
 *     <type> <x1> <y1> <x2> <y2> <flags> <extra...>
 * parsed by CirSim.readCircuit(); the type table lives in CirSim.createCe().
 *
 * The routing strategy is the whole trick here: rather than trying to lay out wires
 * between parts, every pin gets a short stub ending in a **labeled node** (dump type
 * 207) named after its net. CircuitJS treats identically-labelled nodes as one node,
 * so connectivity falls out of the names and parts can sit anywhere on a grid.
 *
 * A caution for anyone extending the element table below. For two-terminal parts the
 * two posts are exactly the coordinates in the dump, so a stub can be attached with
 * confidence. Elements with three or more posts derive the rest in setPoints(), and
 * getting that geometry subtly wrong yields a circuit that loads and simulates but is
 * wired to something other than what the parts table says. Only add a multi-post
 * element here once its setPoints() has actually been read -- that is why MOSFETs,
 * potentiometers and SPDT switches are still exported as annotations.
 */

import { PART_TYPES, parseEngValue } from './ir.js'

const GRID = 16          // CircuitJS's own grid; every coordinate is a multiple
const HALF_BODY = 32     // half the length of a two-terminal element
const STUB = 32          // pin -> label
const CELL = 192
const FLAG_ESCAPE = 4    // TextElm and LabeledNodeElm both use bit 2
const FLAG_MODEL = 2     // DiodeElm and everything extending it

/** A known-good options line, matching what CircuitJS itself writes out. */
const OPTIONS = '$ 1 0.000005 10.20027730826997 50 5 50'

/**
 * CustomLogicModel.escape(). Spaces become \s and '+' becomes \p, so a net called
 * "Top Rail" or "+3V3" survives the whitespace-delimited format intact.
 */
export function escapeText(s) {
    const str = String(s ?? '')
    if (str.length === 0) { return '\\0' }
    return str
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/ /g, '\\s')
        .replace(/\+/g, '\\p')
        .replace(/=/g, '\\q')
        .replace(/#/g, '\\h')
        .replace(/&/g, '\\a')
}

const snap = v => Math.round(v / GRID) * GRID

/** Lowest y touched by an already-emitted element line, for stacking annotations. */
function lineBottom(l) {
    const f = String(l).split(' ')
    if (f[0] === '$') { return 0 }
    return Math.max(parseInt(f[2], 10) || 0, parseInt(f[4], 10) || 0)
}

/* ------------------------------------------------------------------ elements */

function line(type, x1, y1, x2, y2, flags, extra) {
    const parts = [type, x1, y1, x2, y2, flags]
    if (extra !== undefined && extra !== null && extra !== '') { parts.push(extra) }
    return parts.join(' ')
}

/** A net label anchored at (x, y); post 0 is point1, so that is the join point. */
function labelAt(x, y, dx, dy, name) {
    return line('207', x, y, x + dx * GRID, y + dy * GRID, FLAG_ESCAPE, escapeText(name))
}

function wire(x1, y1, x2, y2) {
    return line('w', x1, y1, x2, y2, 0)
}

/* -------------------------------------------------------------------- values */

function numericValue(type, part) {
    const parsed = parseEngValue(part.value)
    const v = parsed === null ? type.falstad.dflt : parsed
    // CircuitJS parses these with Double.valueOf, which chokes on exponent-free
    // JS output for very small numbers ("1e-7" is fine, "0.0000001" is too).
    return String(v)
}

/* -------------------------------------------------------------------- layout */

function cells(count, originX = 160, originY = 160) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
    return i => ({
        x: snap(originX + (i % cols) * CELL),
        y: snap(originY + Math.floor(i / cols) * CELL),
    })
}

/* -------------------------------------------------------------------- export */

/**
 * Render a model as CircuitJS circuit text.
 *
 * Returns { text, url, warnings }. `warnings` lists what could not be simulated --
 * chips, multi-post parts, a missing ground -- so the panel can say so instead of
 * handing over a circuit that quietly does nothing.
 */
export function exportFalstad(model) {
    const out = [OPTIONS]
    const warnings = []
    const annotations = []

    const netName = pin => (pin.netId ? model.netById.get(pin.netId)?.name : null)

    // Parts we can actually simulate get an element; everything else becomes a note.
    const simulated = []
    const unsimulated = []
    for (const part of model.parts) {
        const type = PART_TYPES[part.typeId]
        if (type?.falstad) { simulated.push({ part, type }) } else { unsimulated.push(part) }
    }

    const powerNets = model.nets.filter(n => ['gnd', 'rail', 'supply', 'dac'].includes(n.kind))
    const cellAt = cells(simulated.length + powerNets.length)
    let cellIndex = 0

    for (const { part, type } of simulated) {
        const { x, y } = cellAt(cellIndex++)
        const spec = type.falstad
        const pinOf = n => part.pins.find(p => p.number === n)

        // Extra fields differ per element; see the type table in CirSim.createCe().
        let extra = spec.extra || ''
        if (spec.unit) { extra = [numericValue(type, part), extra].filter(Boolean).join(' ') }
        if (spec.model) { extra = [escapeText(spec.model), extra].filter(Boolean).join(' ') }
        const flags = spec.model ? FLAG_MODEL : 0

        let posts
        if (spec.posts.length === 2) {
            // Vertical, post 0 on top. Both posts are literal dump coordinates.
            const x1 = x, y1 = y - HALF_BODY
            const x2 = x, y2 = y + HALF_BODY
            out.push(line(spec.type, x1, y1, x2, y2, flags, extra))
            posts = [
                { pin: spec.posts[0], x: x1, y: y1, dx: 0, dy: -1 },
                { pin: spec.posts[1], x: x2, y: y2, dx: 0, dy: 1 },
            ]
        } else {
            // Bipolar transistor, laid out horizontally with the base on the left.
            // TransistorElm.setPoints() puts the collector and emitter at point2,
            // displaced perpendicular by hs*dsign*pnp with hs = 16. Held horizontal
            // and left-to-right, dsign is 1, so the offset is +/-16 in y and the sign
            // follows pnp: for an NPN (pnp = -1) the collector lands below.
            const isPnp = spec.extra.startsWith('1 ')
            const x1 = x - HALF_BODY, y1 = y
            const x2 = x + HALF_BODY, y2 = y
            out.push(line(spec.type, x1, y1, x2, y2, 0, extra))
            const collY = y2 + (isPnp ? -GRID : GRID)
            const emitY = y2 + (isPnp ? GRID : -GRID)
            posts = [
                { pin: spec.posts[0], x: x1, y: y1, dx: -1, dy: 0 },
                { pin: spec.posts[1], x: x2, y: collY, dx: 1, dy: 0 },
                { pin: spec.posts[2], x: x2, y: emitY, dx: 1, dy: 0 },
            ]
        }

        for (const post of posts) {
            const name = netName(pinOf(post.pin) || {})
            if (!name) { continue }   // floating pin: leave the post open
            const ex = post.x + post.dx * STUB
            const ey = post.y + post.dy * STUB
            out.push(wire(post.x, post.y, ex, ey))
            out.push(labelAt(ex, ey, post.dx * 2, post.dy * 2, name))
        }

        if (part.refDes) {
            annotations.push({ x, y: y + HALF_BODY + STUB + GRID, text: `${part.refDes} ${part.value || ''}`.trim() })
        }
    }

    // Rails and grounds: without a ground CircuitJS refuses to solve the circuit.
    for (const net of powerNets) {
        const { x, y } = cellAt(cellIndex++)
        if (net.kind === 'gnd') {
            out.push(line('g', x, y, x, y + HALF_BODY, 0, '0'))
        } else {
            const volts = typeof net.voltage === 'number' ? net.voltage : 5
            out.push(line('R', x, y, x, y + HALF_BODY + GRID, 0, `0 40 ${volts} 0 0 0.5`))
        }
        out.push(wire(x, y - STUB, x, y))
        out.push(labelAt(x, y - STUB, 0, -2, net.name))
    }

    if (!model.nets.some(n => n.kind === 'gnd')) {
        warnings.push('No ground net was found, so CircuitJS will refuse to solve the circuit. Add a ground to one net after importing.')
    }

    // Parts with no faithful CircuitJS equivalent. Emitting a wrong element would be
    // worse than emitting none: it would drive nets and corrupt the whole simulation.
    if (unsimulated.length) {
        // Below everything else -- text elements are inert, but overlapping the net
        // labels makes the canvas unreadable at a glance.
        let ty = snap(Math.max(0, ...out.map(lineBottom)) + CELL / 2)
        annotations.push({ x: 160, y: ty, text: 'Not simulated - substitute these by hand', size: 20, left: true })
        for (const part of unsimulated) {
            ty += 24
            const pins = part.pins
                .filter(p => p.netId)
                .map(p => `${p.name || p.number}=${netName(p)}`)
                .join(' ')
            annotations.push({
                x: 160, y: ty, left: true,
                text: `${part.refDes} ${part.value || part.typeId}  ${pins}`.trim(),
            })
        }
        const names = unsimulated.map(p => p.refDes).join(', ')
        warnings.push(`${names} ${unsimulated.length === 1 ? 'has' : 'have'} no CircuitJS equivalent and ${unsimulated.length === 1 ? 'was' : 'were'} exported as a note. Their nets are listed on the canvas so you can drop in real parts.`)
    }

    for (const a of annotations) {
        out.push(line('x', a.x, a.y, a.x + 64, a.y, FLAG_ESCAPE, `${a.size || 16} ${escapeText(a.text)}`))
    }

    const text = out.join('\n') + '\n'
    return { text, url: falstadUrl(text), warnings }
}

/**
 * CircuitJS reads a whole circuit out of the query string (`cct` in CirSim), so the
 * export can open in a running simulator without touching a file.
 *
 * Its query decoder is not a full decodeURIComponent -- a percent-escaped ':', for
 * instance, arrives as the literal "%3A". That is display-only and cannot break
 * connectivity, because both labels of a net are escaped identically and still
 * match; but it is why the annotation text above avoids punctuation, and why the
 * downloaded .txt (File > Import in CircuitJS) is the lossless path.
 */
export function falstadUrl(text, base = 'https://www.falstad.com/circuit/circuitjs.html') {
    return `${base}?cct=${encodeURIComponent(text)}`
}
