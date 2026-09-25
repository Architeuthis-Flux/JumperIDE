/*
 * CircuitJS is whitespace-delimited and positional, so most of what can go wrong is
 * a field count or an escape. These checks pin both down; the browser load in the
 * panel is what confirms the geometry actually connects.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { applyCapture, buildModel, newPart, newProject, inferParts } from '../src/schematic/ir.js'
import { exportFalstad, escapeText, falstadUrl } from '../src/schematic/export_falstad.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = JSON.parse(readFileSync(join(here, 'fixtures/shift_register.json'), 'utf8'))

function fullModel() {
    let project = applyCapture(newProject(), fixture, 'paste')
    const chip = inferParts(project.capture.raw, [], [])[0]
    chip.accepted = true
    chip.refDes = 'U1'
    chip.value = '74HC595'

    const r1 = newPart('R', { refDes: 'R1', value: '330' })
    r1.pinNodes = { 1: '1', 2: '5' }
    const d1 = newPart('LED', { refDes: 'D1', value: 'red' })
    d1.pinNodes = { 2: '5', 1: '9' }

    return buildModel({ ...project, parts: [chip, r1, d1] })
}

/** Element lines only -- skip the options line and comments. */
function elements(text) {
    return text.split('\n').filter(l => l && !l.startsWith('$')).map(l => l.split(' '))
}

test('text escaping matches CustomLogicModel.escape', () => {
    assert.equal(escapeText('Top Rail'), 'Top\\sRail')
    assert.equal(escapeText('+3V3'), '\\p3V3')
    assert.equal(escapeText('a=b'), 'a\\qb')
    assert.equal(escapeText('a#b&c'), 'a\\hb\\ac')
    assert.equal(escapeText('back\\slash'), 'back\\\\slash')
    assert.equal(escapeText(''), '\\0')
})

test('every element line is well-formed', () => {
    const { text } = exportFalstad(fullModel())
    assert.ok(text.startsWith('$ 1 '), 'missing options line')

    for (const f of elements(text)) {
        assert.ok(f.length >= 6, `too few fields: ${f.join(' ')}`)
        for (let i = 1; i <= 5; i++) {
            assert.ok(/^-?\d+$/.test(f[i]), `field ${i} is not an integer in: ${f.join(' ')}`)
        }
        // Nothing may carry a raw space inside a token -- that is what escaping is for.
        assert.equal(f.filter(x => x === '').length, 0, `double space in: ${f.join(' ')}`)
    }
})

test('labels carry escaped net names and the escape flag', () => {
    const { text } = exportFalstad(fullModel())
    const labels = elements(text).filter(f => f[0] === '207')
    assert.ok(labels.length > 0, 'no labeled nodes emitted')
    for (const f of labels) {
        assert.equal(f.length, 7, `labeled node should have exactly one text field: ${f.join(' ')}`)
        assert.equal(parseInt(f[5], 10) & 4, 4, 'FLAG_ESCAPE not set')
        assert.ok(!f[6].includes(' '))
    }
    const names = labels.map(f => f[6])
    assert.ok(names.includes('GND'), `expected a GND label, got ${names.join(',')}`)
    assert.ok(names.includes('\\p3V3'), `expected an escaped +3V3 label, got ${names.join(',')}`)
})

test('every label sits on the end of a wire', () => {
    // A label a pixel off its stub names nothing, and CircuitJS reports no error --
    // it just silently simulates a different circuit.
    const { text } = exportFalstad(fullModel())
    const ends = new Set()
    for (const f of elements(text)) {
        if (f[0] === 'w') { ends.add(`${f[1]},${f[2]}`); ends.add(`${f[3]},${f[4]}`) }
    }
    for (const f of elements(text)) {
        if (f[0] !== '207') { continue }
        assert.ok(ends.has(`${f[1]},${f[2]}`), `label ${f[6]} at ${f[1]},${f[2]} touches no wire`)
    }
})

test('two-terminal parts put their posts where the model says', () => {
    const model = fullModel()
    const { text } = exportFalstad(model)
    const lines = elements(text)

    const r = lines.find(f => f[0] === 'r')
    assert.ok(r, 'resistor missing')
    assert.equal(r[6], '330', 'resistance should come from the part value')

    const led = lines.find(f => f[0] === '162')
    assert.ok(led, 'LED missing')
    assert.equal(parseInt(led[5], 10) & 2, 2, 'LED inherits DiodeElm FLAG_MODEL')
    assert.equal(led.length, 11, `LED needs model + 3 colours + brightness: ${led.join(' ')}`)

    // R1.2 and D1.A share row 5, so both stubs must reach a label with one name.
    const labelsByPoint = new Map()
    for (const f of lines) { if (f[0] === '207') { labelsByPoint.set(`${f[1]},${f[2]}`, f[6]) } }
    const wires = lines.filter(f => f[0] === 'w')
    const nameAtPost = (x, y) => {
        const w = wires.find(f => (f[1] === String(x) && f[2] === String(y)))
        return w ? labelsByPoint.get(`${w[3]},${w[4]}`) : null
    }
    assert.equal(nameAtPost(r[3], r[4]), 'ROW5', 'resistor pin 2 should land on the shared row-5 net')
})

test('a chip is annotated rather than faked as a logic element', () => {
    // CustomLogicElm would drive its outputs and corrupt the rest of the simulation,
    // so unknown chips must not become circuit elements at all.
    const { text, warnings } = exportFalstad(fullModel())
    const types = new Set(elements(text).map(f => f[0]))
    assert.ok(!types.has('208'), 'must not emit CustomLogicElm')
    assert.ok(types.has('x'), 'expected a text annotation for the chip')
    assert.ok(warnings.some(w => w.includes('U1')), `expected a warning naming U1, got: ${warnings}`)
})

test('a ground and a rail are emitted for the power nets', () => {
    const { text, warnings } = exportFalstad(fullModel())
    const lines = elements(text)
    assert.ok(lines.some(f => f[0] === 'g'), 'no ground element')

    const rail = lines.find(f => f[0] === 'R')
    assert.ok(rail, 'no rail element')
    assert.equal(rail[6], '0', 'rail waveform should be WF_DC')
    assert.equal(rail[8], '3.3', 'rail voltage should come from the capture')
    assert.ok(!warnings.some(w => w.includes('ground')), 'should not warn about ground here')
})

test('a circuit with no ground says so', () => {
    let project = applyCapture(newProject(), {
        power: {}, nets: [{ index: 1, name: 'Net 1', nodes: ['4', '8'] }],
    }, 'paste')
    const r = newPart('R', { refDes: 'R1' })
    r.pinNodes = { 1: '4', 2: '8' }
    const { warnings } = exportFalstad(buildModel({ ...project, parts: [r] }))
    assert.ok(warnings.some(w => /ground/i.test(w)), `expected a ground warning, got: ${warnings}`)
})

test('the share URL round-trips the circuit text', () => {
    const { text, url } = exportFalstad(fullModel())
    assert.ok(url.startsWith('https://www.falstad.com/circuit/circuitjs.html?cct='))
    assert.equal(decodeURIComponent(url.split('?cct=')[1]), text)
    assert.equal(falstadUrl('x', 'http://local/c'), 'http://local/c?cct=x')
})
