/*
 * SPDX-License-Identifier: MIT
 *
 * KiCad exporters: a standalone .kicad_sch schematic, and a .net netlist for going
 * straight to Pcbnew without opening the schematic at all.
 *
 * Two things worth knowing before editing this file.
 *
 * 1. It emits schematic format **20230121** (KiCad 7), not the current one. KiCad
 *    7/8/9/10 all read it and upgrade silently on open, and it is also the dialect
 *    KiCanvas -- which draws the panel's preview -- was built around. One output
 *    stream then serves both. That is why the spellings here look dated: bare `hide`
 *    inside `effects`, `(id N)` on properties, `(power)` with no qualifier.
 *
 * 2. **Connectivity is geometric.** Nothing in the file says "R1 pin 2 is on net
 *    GND". A wire whose endpoint exactly touches a pin connects to it, and a label
 *    whose position exactly touches a wire end names that net. So every coordinate
 *    below has to land where it is meant to, to the micron -- a rounding slip
 *    silently produces a schematic that looks right and nets wrong. The round-trip
 *    check in test/ exists precisely to catch that.
 */

import { KICAD_SYMBOL_BODIES } from './kicad_symbols.js'
import { PART_TYPES, partType } from './ir.js'

const SCH_VERSION = '20230121'
const GRID = 1.27          // mm; KiCad's default schematic grid
const STUB = 2.54          // mm of wire between a pin and its net label
const PIN_PITCH = 2.54     // mm between adjacent DIP pins

/* ------------------------------------------------------------------- helpers */

/** KiCad writes plain decimals; keep them short but never lose a grid position. */
function num(n) {
    const r = Math.round(n * 1e4) / 1e4
    return Object.is(r, -0) ? '0' : String(r)
}

function quote(s) {
    return `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Label text is not free-form: '/' opens a hierarchical path, and braces are the
 * escape syntax itself, so both have to be spelled the KiCad way. Empty labels are
 * rejected outright by the schematic editor.
 */
export function sanitizeNetName(name) {
    const s = String(name ?? '').trim()
    if (!s) { return 'NET' }
    return s
        .replace(/\{/g, '{brace}')
        .replace(/\//g, '{slash}')
        .replace(/\s+/g, '_')
}

function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) { return crypto.randomUUID() }
    // Node < 19 and any non-secure context; only needs to be unique within one file.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
        const r = Math.random() * 16 | 0
        return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
}

function snap(v) {
    return Math.round(v / GRID) * GRID
}

/* -------------------------------------------------------------- symbol pins */

/**
 * Pull pin geometry out of a symbol body so we know where to start each wire stub.
 *
 * A pin's `(at x y angle)` is its *connection point* -- the outer end -- and the
 * angle points from there back toward the body. The stub therefore runs the other
 * way, which is why callers negate the x component below.
 */
export function parseSymbolPins(body) {
    const pins = []
    let i = 0
    while ((i = body.indexOf('(pin ', i)) !== -1) {
        let depth = 0
        let end = i
        for (let k = i; k < body.length; k++) {
            if (body[k] === '(') { depth++ }
            else if (body[k] === ')') { depth--; if (depth === 0) { end = k + 1; break } }
        }
        const block = body.slice(i, end)
        i = end

        const at = block.match(/\(at\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\)/)
        const number = block.match(/\(number\s+"([^"]*)"/)
        if (!at || !number) { continue }
        pins.push({
            number: number[1],
            x: parseFloat(at[1]),
            y: parseFloat(at[2]),
            angle: parseFloat(at[3]),
        })
    }
    return pins
}

/**
 * Where a library pin ends up on the sheet, and which way its stub should run.
 *
 * Library symbols use +Y up; the schematic sheet uses +Y down. Everything placed
 * here sits at rotation 0, so the whole transform is that one Y flip -- but forget
 * it and every part comes out mirrored with its labels on the wrong side.
 */
function pinGeometry(pin, originX, originY) {
    const x = originX + pin.x
    const y = originY - pin.y
    const rad = pin.angle * Math.PI / 180
    const dx = -Math.cos(rad)
    const dy = Math.sin(rad)
    return {
        x, y,
        endX: x + dx * STUB,
        endY: y + dy * STUB,
        dx, dy,
    }
}

/* ------------------------------------------------- procedural symbol bodies */

function propertyBlock(key, value, id, x, y, hidden) {
    return [
        `\t\t\t(property ${quote(key)} ${quote(value)} (id ${id}) (at ${num(x)} ${num(y)} 0)`,
        `\t\t\t\t(effects (font (size 1.27 1.27))${hidden ? ' hide' : ''})`,
        '\t\t\t)',
    ].join('\n')
}

function pinBlock(type, x, y, angle, length, name, number) {
    return [
        `\t\t\t\t(pin ${type} line (at ${num(x)} ${num(y)} ${num(angle)}) (length ${num(length)})`,
        `\t\t\t\t\t(name ${quote(name)} (effects (font (size 1.27 1.27))))`,
        `\t\t\t\t\t(number ${quote(number)} (effects (font (size 1.27 1.27))))`,
        '\t\t\t\t)',
    ].join('\n')
}

/**
 * A rectangular body with pins down both sides -- the honest way to draw a chip we
 * know nothing about beyond its pin count. Pins 1..N/2 run down the left, N/2+1..N
 * back up the right, so pin N sits opposite pin 1 exactly as the real package does.
 */
function dipSymbolBody(libId, pinCount, pinNames) {
    const half = Math.max(1, Math.floor(pinCount / 2))
    const bodyHalfW = 5.08
    const pinX = bodyHalfW + PIN_PITCH
    const topY = (half - 1) * (PIN_PITCH / 2)
    const bodyHalfH = topY + PIN_PITCH
    const name = libId.split(':').pop()

    const pins = []
    for (let k = 1; k <= pinCount; k++) {
        const onLeft = k <= half
        const idx = onLeft ? k - 1 : pinCount - k
        const y = topY - idx * PIN_PITCH
        pins.push(pinBlock(
            'passive',
            onLeft ? -pinX : pinX,
            y,
            onLeft ? 0 : 180,
            PIN_PITCH,
            pinNames?.[String(k)] || '~',
            String(k),
        ))
    }

    return [
        `\t\t(symbol ${quote(libId)} (pin_names (offset 1.016)) (in_bom yes) (on_board yes)`,
        propertyBlock('Reference', 'U', 0, -bodyHalfW, bodyHalfH + 1.27, false),
        propertyBlock('Value', name, 1, -bodyHalfW, -bodyHalfH - 2.54, false),
        propertyBlock('Footprint', '', 2, 0, 0, true),
        propertyBlock('Datasheet', '', 3, 0, 0, true),
        `\t\t\t(symbol ${quote(`${name}_0_1`)}`,
        `\t\t\t\t(rectangle (start ${num(-bodyHalfW)} ${num(bodyHalfH)}) (end ${num(bodyHalfW)} ${num(-bodyHalfH)})`,
        '\t\t\t\t\t(stroke (width 0.254) (type default)) (fill (type background))',
        '\t\t\t\t)',
        '\t\t\t)',
        `\t\t\t(symbol ${quote(`${name}_1_1`)}`,
        ...pins,
        '\t\t\t)',
        '\t\t)',
    ].join('\n')
}

/** Single column of pins -- headers, modules, anything with one row of contacts. */
function connSymbolBody(libId, pinCount, pinNames) {
    const bodyHalfW = 1.27
    const pinX = bodyHalfW + PIN_PITCH
    const topY = (pinCount - 1) * (PIN_PITCH / 2)
    const bodyHalfH = topY + PIN_PITCH
    const name = libId.split(':').pop()

    const pins = []
    for (let k = 1; k <= pinCount; k++) {
        pins.push(pinBlock(
            'passive', -pinX, topY - (k - 1) * PIN_PITCH, 0, PIN_PITCH,
            pinNames?.[String(k)] || 'Pin_' + k, String(k),
        ))
    }

    return [
        `\t\t(symbol ${quote(libId)} (pin_names (offset 1.016)) (in_bom yes) (on_board yes)`,
        propertyBlock('Reference', 'J', 0, 0, bodyHalfH + 1.27, false),
        propertyBlock('Value', name, 1, 0, -bodyHalfH - 2.54, false),
        propertyBlock('Footprint', '', 2, 0, 0, true),
        propertyBlock('Datasheet', '', 3, 0, 0, true),
        `\t\t\t(symbol ${quote(`${name}_1_1`)}`,
        `\t\t\t\t(rectangle (start ${num(-bodyHalfW)} ${num(bodyHalfH)}) (end ${num(bodyHalfW)} ${num(-bodyHalfH)})`,
        '\t\t\t\t\t(stroke (width 0.254) (type default)) (fill (type background))',
        '\t\t\t\t)',
        ...pins,
        '\t\t\t)',
        '\t\t)',
    ].join('\n')
}

/** lib_id + body for a part, generating one on the fly for variable-pin types. */
function symbolFor(part) {
    const type = partType(part.typeId)
    if (type.kicad) {
        return { libId: type.kicad, body: KICAD_SYMBOL_BODIES[type.kicad] }
    }
    // Only real labels; an unnamed pin falls back to its number upstream, and
    // stamping "10" as the *name* of pin 10 just yields pinfunction "10_10".
    const pinNames = Object.fromEntries(
        part.pins.filter(p => p.name && p.name !== p.number).map(p => [p.number, p.name]))
    if (part.typeId === 'CONN') {
        const libId = `JumperIDE:Conn_01x${String(part.pinCount).padStart(2, '0')}`
        return { libId, body: connSymbolBody(libId, part.pinCount, pinNames) }
    }
    const libId = `JumperIDE:DIP-${part.pinCount}`
    return { libId, body: dipSymbolBody(libId, part.pinCount, pinNames) }
}

/* --------------------------------------------------------------- power nets */

/**
 * The power symbol for a net, or null to leave it as a plain labelled net.
 *
 * A KiCad power symbol does not merely decorate: it *renames* the net it touches to
 * its own Value, outranking any local label. So a symbol may only be placed when the
 * net is already carrying that exact name -- otherwise KiCad silently renames the
 * net and the exported netlist stops matching the parts table. That is also why a
 * net the user has renamed by hand gets no power symbol: their name wins.
 */
function powerSymbolFor(net) {
    if (!net.canonicalPower) { return null }
    if (sanitizeNetName(net.name) !== sanitizeNetName(net.canonicalPower)) { return null }
    const libId = `power:${net.canonicalPower}`
    return KICAD_SYMBOL_BODIES[libId] ? libId : null
}

/* ------------------------------------------------------------------- layout */

const COL_GAP = 12.7
const ROW_GAP = 10.16
const SHEET_MARGIN = 25.4
const PARTS_PER_COLUMN = 6

/**
 * Lay parts out in columns, sized from their own pin extents plus room for the stub
 * and its label. Generous on purpose: two labels that happen to land on the same
 * coordinate would silently merge two nets, and spacing is far cheaper than
 * detecting that.
 */
function layout(entries) {
    const columns = []
    for (let i = 0; i < entries.length; i += PARTS_PER_COLUMN) {
        columns.push(entries.slice(i, i + PARTS_PER_COLUMN))
    }

    let x = SHEET_MARGIN
    for (const column of columns) {
        let width = 0
        for (const e of column) {
            const xs = e.pins.map(p => p.x)
            const halfW = Math.max(...xs.map(Math.abs), 2.54) + STUB
            const labelW = Math.max(...e.pins.map((_, i) => (e.labels?.[i]?.length || 6)), 6) * 0.9
            e.halfW = halfW
            width = Math.max(width, (halfW + labelW) * 2)
        }

        let y = SHEET_MARGIN
        for (const e of column) {
            const ys = e.pins.map(p => p.y)
            const halfH = Math.max(...ys.map(Math.abs), 2.54) + STUB
            e.x = snap(x + width / 2)
            e.y = snap(y + halfH)
            y = e.y + halfH + ROW_GAP
            placeText(e)
        }
        x += width + COL_GAP
    }
}

/**
 * Park the reference and value where the part is not already busy.
 *
 * A fixed vertical offset works for chips but collides head-on with a resistor,
 * whose pins -- and therefore whose net labels -- occupy exactly that space. So the
 * text follows the free axis: beside parts whose pins run vertically, above and
 * below everything else.
 */
function placeText(e) {
    const spanX = Math.max(...e.pins.map(p => Math.abs(p.x)), 0)
    const spanY = Math.max(...e.pins.map(p => Math.abs(p.y)), 0)

    // Which axis is free depends on where the pins *point*, not how far the symbol
    // reaches. A DIP-16 is taller than it is wide, but its pins and their labels all
    // run sideways, so the clear space is above and below.
    const sideways = e.pins.filter(p => {
        const a = ((p.angle % 360) + 360) % 360
        return a === 0 || a === 180
    }).length

    if (sideways * 2 >= e.pins.length) {
        const dy = spanY + 3.81
        e.refAt = { x: e.x, y: e.y - dy, angle: 0, justify: null }
        e.valAt = { x: e.x, y: e.y + dy, angle: 0, justify: null }
    } else {
        const dx = spanX + 3.81
        e.refAt = { x: e.x + dx, y: e.y - 1.27, angle: 0, justify: 'left' }
        e.valAt = { x: e.x + dx, y: e.y + 1.27, angle: 0, justify: 'left' }
    }
}

/* --------------------------------------------------------------- .kicad_sch */

/**
 * Render a model as a standalone KiCad schematic.
 *
 * Every used symbol is embedded in lib_symbols, so the file opens on a machine with
 * no KiCad libraries installed at all. The lib_ids are still the stock ones
 * (Device:R and friends), so anyone who *does* have the libraries can "Update
 * Symbols from Library" and get the canonical artwork.
 */
export function exportKicadSch(model, options = {}) {
    const projectName = options.projectName || 'jumperless'
    const rootUuid = uuid()

    const entries = []
    for (const part of model.parts) {
        const { libId, body } = symbolFor(part)
        if (!body) { continue }
        const pins = parseSymbolPins(body)
        entries.push({
            part,
            libId,
            body,
            pins,
            labels: pins.map(p => {
                const modelPin = part.pins.find(mp => mp.number === p.number)
                const net = modelPin?.netId ? model.netById.get(modelPin.netId) : null
                return net ? sanitizeNetName(net.name) : null
            }),
        })
    }

    // One power symbol per power net, in their own column at the end. Each gets a
    // PWR_FLAG too: nothing in a breadboard capture is a power *source*, so without
    // one ERC reports every supply as undriven and buries the real warnings.
    const powerEntries = []
    const addPowerEntry = (libId, net) => {
        const body = KICAD_SYMBOL_BODIES[libId]
        if (!body) { return }
        const pins = parseSymbolPins(body)
        powerEntries.push({
            part: {
                id: `pwr_${libId}_${net.id}`,
                refDes: null,
                value: libId.split(':').pop(),
                typeId: null,
                footprint: '',
                pins: pins.map(p => ({ number: p.number })),
            },
            libId,
            body,
            pins,
            labels: pins.map(() => sanitizeNetName(net.name)),
            isPower: true,
        })
    }
    for (const net of model.nets) {
        const libId = powerSymbolFor(net)
        if (!libId) { continue }
        addPowerEntry(libId, net)
        addPowerEntry('power:PWR_FLAG', net)
    }

    const all = [...entries, ...powerEntries]
    layout(all)

    // Deduplicate bodies: many parts share Device:R.
    const libSymbols = new Map()
    for (const e of all) { libSymbols.set(e.libId, e.body) }

    const wires = []
    const labels = []
    const symbols = []
    let pwrIndex = 0

    for (const e of all) {
        e.pins.forEach((pin, i) => {
            const g = pinGeometry(pin, e.x, e.y)
            const text = e.labels[i]
            if (!text) { return }   // unconnected pin: no stub, no label, no lie

            wires.push([
                '\t(wire (pts (xy ' + num(g.x) + ' ' + num(g.y) + ') (xy ' + num(g.endX) + ' ' + num(g.endY) + '))',
                '\t\t(stroke (width 0) (type default))',
                `\t\t(uuid ${uuid()})`,
                '\t)',
            ].join('\n'))

            // Angle and justification follow the stub so text never lies over the wire.
            let angle = 0
            let justify = 'left'
            if (g.dx < -0.5) { angle = 180; justify = 'right' }
            else if (g.dx > 0.5) { angle = 0; justify = 'left' }
            else if (g.dy < -0.5) { angle = 90; justify = 'left' }
            else { angle = 270; justify = 'right' }

            labels.push([
                `\t(label ${quote(text)} (at ${num(g.endX)} ${num(g.endY)} ${angle})`,
                `\t\t(effects (font (size 1.27 1.27)) (justify ${justify} bottom))`,
                `\t\t(uuid ${uuid()})`,
                '\t)',
            ].join('\n'))
        })

        const refDes = e.isPower ? `#PWR${String(++pwrIndex).padStart(3, '0')}` : (e.part.refDes || '?')
        symbols.push(symbolInstance(e, refDes, projectName, rootUuid))
    }

    return [
        `(kicad_sch (version ${SCH_VERSION}) (generator jumperide)`,
        '',
        `  (uuid ${rootUuid})`,
        '',
        '  (paper "A3")',
        '',
        '  (title_block',
        `    (title ${quote(model.title || 'Jumperless circuit')})`,
        `    (comment 1 ${quote('Generated by JumperIDE from a captured Jumperless netlist')})`,
        '  )',
        '',
        '\t(lib_symbols',
        [...libSymbols.values()].join('\n'),
        '\t)',
        '',
        wires.join('\n'),
        labels.join('\n'),
        symbols.join('\n'),
        '',
        '\t(sheet_instances',
        '\t\t(path "/" (page "1"))',
        '\t)',
        ')',
        '',
    ].join('\n')
}

function symbolInstance(e, refDes, projectName, rootUuid) {
    const lines = [
        `\t(symbol (lib_id ${quote(e.libId)}) (at ${num(e.x)} ${num(e.y)} 0) (unit 1)`,
        '\t\t(in_bom yes) (on_board yes)',
        `\t\t(uuid ${uuid()})`,
        `\t\t(property "Reference" ${quote(refDes)} (id 0) (at ${num(e.refAt.x)} ${num(e.refAt.y)} 0)`,
        `\t\t\t(effects (font (size 1.27 1.27))${e.refAt.justify ? ` (justify ${e.refAt.justify})` : ''}${e.isPower ? ' hide' : ''})`,
        '\t\t)',
        `\t\t(property "Value" ${quote(e.part.value || '')} (id 1) (at ${num(e.valAt.x)} ${num(e.valAt.y)} 0)`,
        `\t\t\t(effects (font (size 1.27 1.27))${e.valAt.justify ? ` (justify ${e.valAt.justify})` : ''}${e.isPower ? ' hide' : ''})`,
        '\t\t)',
        `\t\t(property "Footprint" ${quote(e.part.footprint || '')} (id 2) (at ${num(e.x)} ${num(e.y)} 0)`,
        '\t\t\t(effects (font (size 1.27 1.27)) hide)',
        '\t\t)',
        `\t\t(property "Datasheet" "" (id 3) (at ${num(e.x)} ${num(e.y)} 0)`,
        '\t\t\t(effects (font (size 1.27 1.27)) hide)',
        '\t\t)',
    ]
    for (const pin of e.pins) {
        lines.push(`\t\t(pin ${quote(pin.number)} (uuid ${uuid()}))`)
    }
    lines.push(
        '\t\t(instances',
        `\t\t\t(project ${quote(projectName)}`,
        `\t\t\t\t(path ${quote('/' + rootUuid)}`,
        `\t\t\t\t\t(reference ${quote(refDes)}) (unit 1)`,
        '\t\t\t\t)',
        '\t\t\t)',
        '\t\t)',
        '\t)',
    )
    return lines.join('\n')
}

/* --------------------------------------------------------------------- .net */

/**
 * KiCad netlist, importable straight into Pcbnew. Skips the schematic entirely for
 * anyone who just wants a board from what they breadboarded.
 */
export function exportKicadNet(model, options = {}) {
    const date = options.date || new Date().toISOString()
    const source = options.source || 'JumperIDE'

    const comps = model.parts.map(part => {
        const type = PART_TYPES[part.typeId]
        const lib = type?.kicad ? type.kicad.split(':')[0] : 'JumperIDE'
        const name = type?.kicad ? type.kicad.split(':')[1]
            : (part.typeId === 'CONN' ? `Conn_01x${part.pinCount}` : `DIP-${part.pinCount}`)
        return [
            `    (comp (ref ${quote(part.refDes)})`,
            `      (value ${quote(part.value || name)})`,
            `      (footprint ${quote(part.footprint || '')})`,
            `      (libsource (lib ${quote(lib)}) (part ${quote(name)}))`,
            `      (tstamps ${quote('/' + part.id)}))`,
        ].join('\n')
    })

    // A net with fewer than two pins is not a connection; Pcbnew has no use for it.
    const nets = []
    let code = 0
    for (const net of model.nets) {
        const nodes = []
        for (const part of model.parts) {
            for (const pin of part.pins) {
                if (pin.netId === net.id) {
                    nodes.push(`      (node (ref ${quote(part.refDes)}) (pin ${quote(pin.number)}))`)
                }
            }
        }
        if (nodes.length < 2) { continue }
        code += 1
        nets.push([
            `    (net (code ${quote(code)}) (name ${quote(sanitizeNetName(net.name))})`,
            nodes.join('\n') + ')',
        ].join('\n'))
    }

    return [
        '(export (version "E")',
        '  (design',
        `    (source ${quote(source)})`,
        `    (date ${quote(date)})`,
        '    (tool "JumperIDE"))',
        '  (components',
        comps.join('\n') + ')',
        '  (nets',
        nets.join('\n') + '))',
        '',
    ].join('\n')
}
