/*
 * Checks for the schematic IR. Run with:
 *   node --test test/
 *
 * These are all pure-function tests -- no DOM, no device. The point is that the
 * whole capture -> infer -> model pipeline is exercisable from a fixture, so the
 * exporters can be developed and debugged without a Jumperless plugged in.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
    applyCapture, buildModel, classifyNet, dipPinNode, inferParts, matchNets,
    newPart, newProject, parseCapture, parseEngValue, resolvePart, netAnchor,
} from '../src/schematic/ir.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(readFileSync(join(here, 'fixtures/shift_register.json'), 'utf8'))

function captured() {
    return applyCapture(newProject(), fixture, 'paste')
}

test('parseCapture tolerates REPL noise around the JSON', () => {
    const noisy = `MicroPython v1.24\r\n>>> ${JSON.stringify(fixture)}\r\nOK\r\n`
    const parsed = parseCapture(noisy)
    assert.equal(parsed.nets.length, 6)
    assert.deepEqual(parsed.nets[0].nodes, ['GND', '17', '43', '9'])
})

test('parseCapture rejects payloads that are not board state', () => {
    assert.throws(() => parseCapture('{"hello": 1}'), /nets/)
    assert.throws(() => parseCapture('not json at all'), /No JSON object/)
})

test('reserved single-node nets are dropped', () => {
    // The firmware seeds nets 1-5 (GND, both rails, both DACs) with one node each,
    // present whether or not anything is attached. They connect nothing, and leaving
    // them in put phantom supplies and a second, empty GND into every capture.
    const withInfra = {
        power: { top_rail: 3.3, bottom_rail: 5, dac0: 0, dac1: 0 },
        nets: [
            { index: 1, name: 'GND', nodes: ['GND'] },
            { index: 2, name: 'Top Rail', nodes: ['TOP_R'] },
            { index: 3, name: 'Bottom Rail', nodes: ['BOT_R'] },
            { index: 4, name: 'DAC 0', nodes: ['DAC_0'] },
            { index: 5, name: 'DAC 1', nodes: ['DAC_1'] },
            { index: 6, name: 'Net 6', nodes: ['10', '1'] },
        ],
    }
    const capture = parseCapture(withInfra)
    assert.equal(capture.nets.length, 1)
    assert.deepEqual(capture.nets[0].nodes, ['10', '1'])
})

test('a reserved net that is actually wired is kept', () => {
    // The same DAC is real once something is attached to it.
    const capture = parseCapture({
        power: {}, nets: [{ index: 4, name: 'DAC 0', nodes: ['DAC_0', '14'] }],
    })
    assert.equal(capture.nets.length, 1)
    assert.equal(classifyNet(capture.nets[0]), 'dac')
})

test('two ground nets are told apart by node, not by a counter', () => {
    // GND and BOT_GND are physically distinct nodes; each is its own net until
    // something ties them together, and both canonicalise to "GND".
    const project = applyCapture(newProject(), {
        power: { top_rail: 3.3, bottom_rail: 5 },
        nets: [
            { index: 1, name: 'GND', nodes: ['GND', '17'] },
            { index: 2, name: 'Net 2', nodes: ['BOT_GND', '22'] },
        ],
    }, 'paste')
    const names = buildModel(project).nets.map(n => n.name)
    assert.deepEqual(names, ['GND', 'BOT_GND'])
})

test('net classification ignores the unreliable `special` field', () => {
    // JsonState.cpp lets the last matching node win, so a GND net can report "ADC".
    const net = { nodes: ['GND', '12', 'ADC_0'], special: 'ADC' }
    assert.equal(classifyNet(net), 'gnd')
    assert.equal(netAnchor(net), 'GND')
})

test('DIP pin numbering wraps the package the way the real part does', () => {
    // DIP-16 anchored at row 10: pins 1..8 down the top half, 9..16 back up the bottom.
    assert.equal(dipPinNode(10, 16, 'top', '1'), '10')
    assert.equal(dipPinNode(10, 16, 'top', '8'), '17')
    assert.equal(dipPinNode(10, 16, 'top', '9'), '47')  // across the channel from pin 8
    assert.equal(dipPinNode(10, 16, 'top', '16'), '40') // across the channel from pin 1
    // Flipping the chip swaps which half pin 1 lands on.
    assert.equal(dipPinNode(10, 16, 'bottom', '1'), '40')
    assert.equal(dipPinNode(10, 16, 'bottom', '16'), '10')
    // Out of range is null, not a bogus row.
    assert.equal(dipPinNode(10, 16, 'top', '17'), null)
    assert.equal(dipPinNode(28, 16, 'top', '9'), null)
})

test('inference finds a sparsely-wired DIP-16 at the right anchor row', () => {
    const project = captured()
    const guesses = inferParts(project.capture.raw, [], [])
    assert.ok(guesses.length >= 1, 'expected at least one chip guess')
    const chip = guesses[0]
    assert.equal(chip.pinCount, 16)
    assert.equal(chip.placement.anchorRow, 10)
    assert.equal(chip.accepted, false)
    assert.equal(chip.provenance, 'inferred')
})

test('the guessed chip lands its power pins on power nets', () => {
    // The corner-power signal is what picks between equally-sized windows, so check
    // the result is coherent rather than just well-scored: pin N/2 on ground and
    // pin N on a rail is the layout almost every DIP actually uses.
    const project = captured()
    const chip = inferParts(project.capture.raw, [], [])[0]
    chip.accepted = true
    const model = buildModel({ ...project, parts: [chip] })
    const pin = n => model.parts[0].pins.find(p => p.number === String(n))

    assert.equal(model.netById.get(pin(chip.pinCount / 2).netId)?.kind, 'gnd')
    assert.equal(model.netById.get(pin(chip.pinCount).netId)?.kind, 'rail')
})

test('a chip inserted upside down is detected as flipped', () => {
    // Same board, both halves swapped: the guess should flip pin 1 to the bottom
    // rather than silently mis-assign every pin.
    const flipped = JSON.parse(JSON.stringify(fixture))
    for (const net of flipped.nets) {
        net.nodes = net.nodes.map(n => {
            const row = parseInt(n, 10)
            if (!/^\d+$/.test(n) || row < 1 || row > 60) { return n }
            return String(row <= 30 ? row + 30 : row - 30)
        })
    }
    const project = applyCapture(newProject(), flipped, 'paste')
    const chip = inferParts(project.capture.raw, [], [])[0]
    assert.equal(chip.placement.pin1Half, 'bottom')
    assert.equal(chip.pinCount, 16)
})

test('inference does not emit overlapping guesses for the same chip', () => {
    const project = captured()
    const guesses = inferParts(project.capture.raw, [], [])
    const spans = guesses.map(g => [g.placement.anchorRow, g.placement.anchorRow + g.pinCount / 2 - 1])
    for (let i = 0; i < spans.length; i++) {
        for (let j = i + 1; j < spans.length; j++) {
            const overlap = spans[i][0] <= spans[j][1] && spans[j][0] <= spans[i][1]
            assert.ok(!overlap, `guesses ${i} and ${j} overlap: ${spans[i]} vs ${spans[j]}`)
        }
    }
})

test('a rejected suggestion stays rejected across a re-capture', () => {
    const project = captured()
    const first = inferParts(project.capture.raw, [], [])
    const rejected = [`dip:${first[0].placement.anchorRow}:${first[0].pinCount}`]
    const second = inferParts(project.capture.raw, [], rejected)
    assert.ok(!second.some(p => p.placement.anchorRow === first[0].placement.anchorRow &&
                                p.pinCount === first[0].pinCount))
})

test('pins resolve to nets through their nodes', () => {
    const project = captured()
    const chip = newPart('DIP', { pinCount: 16, refDes: 'U1' })
    chip.placement = { kind: 'dip', anchorRow: 10, pin1Half: 'top' }
    project.parts = [chip]

    const model = buildModel(project)
    const u1 = model.parts[0]
    const pin = n => u1.pins.find(p => p.number === String(n))

    assert.equal(pin(8).node, '17')
    assert.equal(model.netById.get(pin(8).netId).kind, 'gnd')      // row 17 is in the GND net
    assert.equal(model.netById.get(pin(16).netId).kind, 'rail')    // row 40 is on the top rail
    assert.equal(pin(1).state, 'bound')                            // row 10 -> Net 6
    assert.equal(pin(2).state, 'floating')                         // row 11 is wired to nothing
})

test('two pins sharing an un-reported row still land on one net', () => {
    // The firmware only reports rows its crossbar touched. Row 5 holds the junction
    // between R1 and D1 and appears in no net -- but the legs are physically joined,
    // and a schematic that dropped that would be wrong.
    const project = captured()
    const r1 = newPart('R', { refDes: 'R1', value: '330' })
    r1.pinNodes = { 1: '1', 2: '5' }
    const d1 = newPart('LED', { refDes: 'D1' })
    d1.pinNodes = { 2: '5', 1: '9' }   // pin 2 = anode, pin 1 = cathode
    project.parts = [r1, d1]

    const model = buildModel(project)
    const rPin2 = model.parts[0].pins.find(p => p.number === '2')
    const dPin2 = model.parts[1].pins.find(p => p.number === '2')

    assert.ok(rPin2.netId, 'R1.2 should have been given a synthetic net')
    assert.equal(rPin2.netId, dPin2.netId, 'R1.2 and D1.A share row 5, so share a net')
    assert.equal(model.netById.get(rPin2.netId).synthetic, true)

    // ...and the cathode reaches real ground through row 9.
    const dPin1 = model.parts[1].pins.find(p => p.number === '1')
    assert.equal(model.netById.get(dPin1.netId).kind, 'gnd')
})

test('every net name in the model is unique', () => {
    const project = captured()
    const a = newPart('R', { refDes: 'R1' }); a.pinNodes = { 1: '1', 2: '5' }
    const b = newPart('R', { refDes: 'R2' }); b.pinNodes = { 1: '2', 2: '6' }
    project.parts = [a, b]
    const names = buildModel(project).nets.map(n => n.name)
    assert.equal(new Set(names).size, names.length, `duplicate net names: ${names}`)
})

test('re-capture keeps part bindings and carries net names across', () => {
    const project = captured()
    const chip = newPart('DIP', { pinCount: 16, refDes: 'U1' })
    chip.placement = { kind: 'dip', anchorRow: 10, pin1Half: 'top' }
    project.parts = [chip]

    // Name the net on D11, then rewire something unrelated and re-capture.
    const before = buildModel(project)
    const clkNet = before.nets.find(n => n.nodes.includes('D11'))
    project.netAnnotations = { [clkNet.id]: { name: 'SPI_CLK' } }

    const rewired = JSON.parse(JSON.stringify(fixture))
    rewired.nets.push({ index: 7, name: 'Net 7', nodes: ['A0', '22'], special: 'none' })
    rewired.nets[5].nodes = ['10', '1', '25']            // extra jumper onto Net 6
    const after = buildModel(applyCapture(project, rewired, 'paste'))

    const stillClk = after.nets.find(n => n.nodes.includes('D11'))
    assert.equal(stillClk.name, 'SPI_CLK', 'net name should follow the net')

    const u1 = after.parts[0]
    assert.equal(u1.pins.find(p => p.number === '8').node, '17')
    assert.equal(after.netById.get(u1.pins.find(p => p.number === '8').netId).kind, 'gnd')
})

test('matchNets reuses ids for renumbered nets and orphans the vanished ones', () => {
    const nets = fixture.nets.map(n => ({ ...n }))
    const first = matchNets([], nets)
    assert.equal(first.orphans.length, 0)

    // Drop a net and renumber the rest -- exactly what moving a jumper does.
    const fewer = nets.filter(n => !n.nodes.includes('D11')).map((n, i) => ({ ...n, index: i + 1 }))
    const second = matchNets(first.identity, fewer)
    assert.equal(second.orphans.length, 1)

    const gndBefore = first.identity[nets.findIndex(n => n.nodes.includes('GND'))].netId
    const gndAfter = second.identity[fewer.findIndex(n => n.nodes.includes('GND'))].netId
    assert.equal(gndBefore, gndAfter, 'the ground net keeps its identity')
})

test('a pin explicitly marked NC resolves to nc, not floating', () => {
    const project = captured()
    const chip = newPart('DIP', { pinCount: 16, refDes: 'U1' })
    chip.placement = { kind: 'dip', anchorRow: 10, pin1Half: 'top' }
    chip.pinNodes = { 2: 'NC' }
    const model = buildModel({ ...project, parts: [chip] })
    assert.equal(model.parts[0].pins.find(p => p.number === '2').state, 'nc')
})

test('unplaced parts report unassigned pins rather than throwing', () => {
    const r = newPart('R', { refDes: 'R9' })
    const resolved = resolvePart(r, new Map())
    assert.equal(resolved['1'].state, 'unassigned')
    assert.equal(resolved['2'].state, 'unassigned')
})

/** Float multiplication makes 100 * 1e-9 land a ulp off 1e-7; compare relatively. */
function close(actual, expected) {
    assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * 1e-12,
        `${actual} is not ~${expected}`)
}

test('engineering values parse the way people write them', () => {
    assert.equal(parseEngValue('10k'), 10000)
    close(parseEngValue('100n'), 1e-7)
    close(parseEngValue('4u7'), 4.7e-6)
    close(parseEngValue('2M2'), 2.2e6)
    assert.equal(parseEngValue('330'), 330)
    assert.equal(parseEngValue('1.5k'), 1500)
    assert.equal(parseEngValue('470R'), 470)
    assert.equal(parseEngValue('10 kΩ'), 10000)
    assert.equal(parseEngValue('LED'), null)
    assert.equal(parseEngValue(''), null)
})
