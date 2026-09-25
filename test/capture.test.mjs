/*
 * The fallback netlist reader is MicroPython embedded in a JS string, which is a
 * shape that goes wrong quietly -- one backslash off and the JSON it prints is
 * unparseable, on hardware, in front of a user. So run it for real against a stub
 * module and feed the output through the same parser the panel uses.
 *
 * Requires python3 on PATH; skipped otherwise. It is CPython, not MicroPython, so
 * this proves the syntax and the escaping, not the firmware API surface.
 */

import { test, skip } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NETLIST_FALLBACK_PY, GET_STATE_PY } from '../src/schematic/capture.js'
import { applyCapture, buildModel, newProject, parseCapture } from '../src/schematic/ir.js'

function hasPython() {
    try { execFileSync('python3', ['--version'], { stdio: 'pipe' }); return true } catch (_) { return false }
}

/*
 * Stands in for the firmware module. Net 2's name raises UnicodeError, which is the
 * failure that makes get_state() unusable on a real board; net 3's name carries a
 * quote and a control character.
 */
const STUB = `
def get_num_nets(): return 6
_N = {1:'GND,17,43,9', 2:'TOP_R,40,46', 3:'D11,45', 4:'D12,44', 5:'D13,42', 6:'10,1'}
def get_net_nodes(i): return _N.get(i, '')
def get_net_name(i):
    if i == 2: raise UnicodeError()
    if i == 3: return 'SPI "CLK"\\tline'
    return {1:'GND', 4:'Net 4', 5:'Net 5', 6:'Net 6'}.get(i, '')
def dac_get(c): return [0.0, 1.5, 3.3, 5.0][c]
`

function runFallback(stub = STUB) {
    const dir = mkdtempSync(join(tmpdir(), 'jumperide-capture-'))
    writeFileSync(join(dir, 'jumperless.py'), stub)
    writeFileSync(join(dir, 'run.py'), NETLIST_FALLBACK_PY)
    return execFileSync('python3', [join(dir, 'run.py')], { cwd: dir, stdio: 'pipe', timeout: 30000 }).toString()
}

const pyTest = hasPython() ? test : skip

test('the fast path asks for the whole state in one call', () => {
    assert.match(GET_STATE_PY, /import jumperless/)
    assert.match(GET_STATE_PY, /print\(jumperless\.get_state\(\)\)/)
})

pyTest('the fallback prints JSON the panel can parse', () => {
    const capture = parseCapture(runFallback())
    assert.equal(capture.nets.length, 6)
    assert.deepEqual(capture.nets[0].nodes, ['GND', '17', '43', '9'])
    assert.equal(capture.power.top_rail, 3.3)
    assert.equal(capture.power.bottom_rail, 5.0)
    assert.equal(capture.power.dac1, 1.5)
})

pyTest('a net whose name raises keeps its nodes', () => {
    // The whole point of reading net by net: one bad name must not cost the netlist.
    const capture = parseCapture(runFallback())
    const rail = capture.nets.find(n => n.nodes.includes('TOP_R'))
    assert.ok(rail, 'the rail net should still be present')
    assert.equal(rail.name, '')
    assert.deepEqual(rail.nodes, ['TOP_R', '40', '46'])
})

pyTest('quotes and control characters in a name survive as valid JSON', () => {
    const capture = parseCapture(runFallback())
    const net = capture.nets.find(n => n.nodes.includes('D11'))
    assert.equal(net.name, 'SPI "CLK"line', 'quotes escaped, tab dropped')
})

pyTest('the rebuilt capture drives the rest of the pipeline', () => {
    const model = buildModel(applyCapture(newProject(), runFallback(), 'device'))
    const names = model.nets.map(n => `${n.name}[${n.kind}]`)
    assert.ok(names.includes('GND[gnd]'), names.join(' '))
    // This path reports no per-net voltage at all, so the rail's identity has to come
    // from the board-level power block -- otherwise it is named after its node and
    // exports as a 5 V supply that the board never had.
    assert.ok(names.includes('+3V3[rail]'), names.join(' '))
    assert.equal(model.nets.find(n => n.name === '+3V3').voltage, 3.3)
})

pyTest('a board with no nets yields an empty capture, not a crash', () => {
    const empty = 'def get_num_nets(): return 0\ndef get_net_nodes(i): return ""\ndef get_net_name(i): return ""\ndef dac_get(c): return 0.0\n'
    const capture = parseCapture(runFallback(empty))
    assert.equal(capture.nets.length, 0)
})

pyTest('a board where every query raises still prints parseable JSON', () => {
    const broken = 'def get_num_nets(): raise RuntimeError()\ndef get_net_nodes(i): raise RuntimeError()\ndef get_net_name(i): raise RuntimeError()\ndef dac_get(c): raise RuntimeError()\n'
    const capture = parseCapture(runFallback(broken))
    assert.equal(capture.nets.length, 0)
    assert.equal(capture.power.top_rail, 0)
})
