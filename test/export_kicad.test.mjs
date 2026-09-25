/*
 * The KiCad exporter's real test is the round-trip: generate a .kicad_sch, hand it
 * to kicad-cli, and check the netlist *KiCad* derives from the geometry matches what
 * the model said. Nothing in the file declares connectivity -- it emerges from wires
 * and labels landing on exact coordinates -- so this is the only check that proves a
 * pin ended up on the net we intended.
 *
 * kicad-cli is skipped automatically when KiCad is not installed; the pure-string
 * checks still run.
 */

import { test, skip } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { applyCapture, buildModel, newPart, newProject, inferParts } from '../src/schematic/ir.js'
import { exportKicadSch, exportKicadNet, sanitizeNetName, parseSymbolPins } from '../src/schematic/export_kicad.js'
import { KICAD_SYMBOL_BODIES } from '../src/schematic/kicad_symbols.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(readFileSync(join(here, 'fixtures/shift_register.json'), 'utf8'))

const KICAD_CLI = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli'
const hasKicad = existsSync(KICAD_CLI)

/** The fixture circuit, fully declared: the shift register plus its LED and resistor. */
function fullModel() {
    let project = applyCapture(newProject(), fixture, 'paste')

    const chip = inferParts(project.capture.raw, [], [])[0]
    chip.accepted = true
    chip.refDes = 'U1'
    chip.value = '74HC595'
    chip.pinLabels = { 8: 'GND', 16: 'VCC', 11: 'SHCP', 12: 'STCP', 14: 'DS', 13: 'OE', 10: 'MR' }

    const r1 = newPart('R', { refDes: 'R1', value: '330' })
    r1.pinNodes = { 1: '1', 2: '5' }

    const d1 = newPart('LED', { refDes: 'D1', value: 'red' })
    d1.pinNodes = { 2: '5', 1: '9' }

    project = { ...project, parts: [chip, r1, d1] }
    return buildModel(project)
}

function balanced(text) {
    let depth = 0
    let inString = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inString) {
            if (ch === '\\') { i++ }
            else if (ch === '"') { inString = false }
            continue
        }
        if (ch === '"') { inString = true }
        else if (ch === '(') { depth++ }
        else if (ch === ')') { depth--; if (depth < 0) { return false } }
    }
    return depth === 0
}

/** Net membership as {netName: ["R1.2", "D1.2", ...]}, for comparing model vs KiCad. */
function membershipFromModel(model) {
    const out = {}
    for (const part of model.parts) {
        for (const pin of part.pins) {
            if (!pin.netId) { continue }
            const name = sanitizeNetName(model.netById.get(pin.netId).name)
            ;(out[name] ||= []).push(`${part.refDes}.${pin.number}`)
        }
    }
    for (const k of Object.keys(out)) {
        if (out[k].length < 2) { delete out[k] } else { out[k].sort() }
    }
    return out
}

/** Same shape, parsed out of whatever kicad-cli produced. */
function membershipFromNetlist(text) {
    const out = {}
    const netRe = /\(net\s+\(code\s+"?\d+"?\)\s+\(name\s+"([^"]*)"\)([\s\S]*?)(?=\n\s{0,4}\(net\s|\n\s*\)\s*$)/g
    let m
    while ((m = netRe.exec(text)) !== null) {
        const name = m[1].replace(/^\//, '')
        const nodes = [...m[2].matchAll(/\(node\s+\(ref\s+"([^"]*)"\)\s+\(pin\s+"([^"]*)"\)/g)]
            .map(n => `${n[1]}.${n[2]}`)
        const real = nodes.filter(n => !n.startsWith('#PWR'))
        if (real.length >= 2) { out[name] = real.sort() }
    }
    return out
}

test('every stock symbol body exposes parseable pins', () => {
    for (const [libId, body] of Object.entries(KICAD_SYMBOL_BODIES)) {
        const pins = parseSymbolPins(body)
        assert.ok(pins.length > 0, `${libId} yielded no pins`)
        for (const p of pins) {
            assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${libId} pin ${p.number} has no position`)
        }
    }
    // Spot-check the two whose numbering trips people up.
    assert.deepEqual(parseSymbolPins(KICAD_SYMBOL_BODIES['Device:Q_NPN']).map(p => p.number).sort(), ['B', 'C', 'E'])
    assert.deepEqual(parseSymbolPins(KICAD_SYMBOL_BODIES['Device:LED']).map(p => p.number).sort(), ['1', '2'])
})

test('net names are escaped the way KiCad spells them', () => {
    assert.equal(sanitizeNetName('RX/0'), 'RX{slash}0')
    assert.equal(sanitizeNetName('Top Rail'), 'Top_Rail')
    assert.equal(sanitizeNetName(''), 'NET')
    assert.equal(sanitizeNetName('  '), 'NET')
})

test('schematic is well-formed and self-contained', () => {
    const sch = exportKicadSch(fullModel())
    assert.ok(balanced(sch), 'unbalanced parentheses')
    assert.match(sch, /^\(kicad_sch \(version 20230121\)/)
    assert.match(sch, /\(sheet_instances/)

    // Every lib_id referenced by an instance must be embedded, or the file will not
    // open on a machine without the KiCad libraries.
    const defined = new Set([...sch.matchAll(/\(symbol "([^"]+:[^"]+)"/g)].map(m => m[1]))
    const used = new Set([...sch.matchAll(/\(lib_id "([^"]+)"\)/g)].map(m => m[1]))
    for (const libId of used) {
        assert.ok(defined.has(libId), `${libId} is used but not embedded in lib_symbols`)
    }
})

test('no two labels share a coordinate', () => {
    // Two labels on one point would silently weld two nets together -- the exact
    // failure mode that looks fine in the preview and ruins the board.
    const sch = exportKicadSch(fullModel())
    const seen = new Map()
    for (const m of sch.matchAll(/\(label "([^"]*)" \(at (-?[\d.]+) (-?[\d.]+) /g)) {
        const key = `${m[2]},${m[3]}`
        if (seen.has(key) && seen.get(key) !== m[1]) {
            assert.fail(`labels "${seen.get(key)}" and "${m[1]}" both sit at ${key}`)
        }
        seen.set(key, m[1])
    }
})

test('every wire stub starts exactly on a pin', () => {
    // Connectivity is geometric: a stub that starts a hair off its pin connects to
    // nothing, and KiCad reports no error.
    const model = fullModel()
    const sch = exportKicadSch(model)

    const symbolPins = new Set()
    for (const m of sch.matchAll(/\(symbol \(lib_id "([^"]+)"\) \(at (-?[\d.]+) (-?[\d.]+) 0\)/g)) {
        const body = sch.slice(sch.indexOf(`(symbol "${m[1]}"`))
        for (const pin of parseSymbolPins(body.slice(0, body.indexOf('\n\t\t)\n') + 8))) {
            const x = Math.round((parseFloat(m[2]) + pin.x) * 1e4) / 1e4
            const y = Math.round((parseFloat(m[3]) - pin.y) * 1e4) / 1e4
            symbolPins.add(`${x},${y}`)
        }
    }

    const starts = [...sch.matchAll(/\(wire \(pts \(xy (-?[\d.]+) (-?[\d.]+)\)/g)]
        .map(m => `${parseFloat(m[1])},${parseFloat(m[2])}`)
    assert.ok(starts.length > 0, 'no wires emitted')
    for (const s of starts) {
        assert.ok(symbolPins.has(s), `wire starts at ${s}, which is not a pin`)
    }
})

test('netlist export drops single-pin nets and keeps real ones', () => {
    const model = fullModel()
    const net = exportKicadNet(model)
    assert.ok(balanced(net), 'unbalanced parentheses')
    assert.match(net, /\(export \(version "E"\)/)
    assert.match(net, /\(comp \(ref "U1"\)/)
    assert.match(net, /\(comp \(ref "R1"\)/)

    for (const m of net.matchAll(/\(net \(code[\s\S]*?(?=\(net \(code|\)\)$)/g)) {
        const nodes = [...m[0].matchAll(/\(node /g)].length
        assert.ok(nodes >= 2, `emitted a net with ${nodes} node(s)`)
    }
})

const kicadTest = hasKicad ? test : skip

kicadTest('KiCad derives the same net membership we intended', () => {
    const model = fullModel()
    const dir = mkdtempSync(join(tmpdir(), 'jumperide-sch-'))
    const schPath = join(dir, 'roundtrip.kicad_sch')
    const netPath = join(dir, 'roundtrip.net')
    writeFileSync(schPath, exportKicadSch(model))

    execFileSync(KICAD_CLI, ['sch', 'export', 'netlist', '--output', netPath, schPath], {
        stdio: 'pipe', timeout: 120000,
    })

    const expected = membershipFromModel(model)
    const actual = membershipFromNetlist(readFileSync(netPath, 'utf8'))

    for (const [name, pins] of Object.entries(expected)) {
        assert.ok(actual[name], `KiCad found no net named ${name} (it has: ${Object.keys(actual).join(', ')})`)
        assert.deepEqual(actual[name], pins, `net ${name} has the wrong pins`)
    }
})

kicadTest('KiCad opens the file without upgrade or parse errors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jumperide-sch-'))
    const schPath = join(dir, 'upgrade.kicad_sch')
    writeFileSync(schPath, exportKicadSch(fullModel()))
    // `sch upgrade` is the cheapest full parse + write cycle KiCad exposes.
    execFileSync(KICAD_CLI, ['sch', 'upgrade', schPath], { stdio: 'pipe', timeout: 120000 })
    assert.ok(readFileSync(schPath, 'utf8').startsWith('(kicad_sch'))
})
