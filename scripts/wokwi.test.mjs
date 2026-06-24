/*
 * Self-check for the pure Wokwi helpers in src/wokwi.js.
 * Run: node scripts/wokwi.test.mjs
 * No framework — throws on the first failed assertion, exits 0 if all pass.
 */
import assert from 'node:assert/strict'
import { parseWokwiId, idToProjectUrl, hashDiagram, mapPinName, constructNetlist, buildWokwiCommand } from '../src/wokwi_protocol.mjs'

let n = 0
const ok = (name) => { n++; console.log(`  ok ${name}`) }

// — parseWokwiId —
assert.equal(parseWokwiId('https://wokwi.com/projects/399335389161866241'), '399335389161866241'); ok('parse project URL')
assert.equal(parseWokwiId('399335389161866241'), '399335389161866241'); ok('parse bare id')
assert.equal(parseWokwiId('https://wokwi.com/api/projects/399335389161866241/diagram.json'), '399335389161866241'); ok('parse api URL')
assert.equal(parseWokwiId('  399335389161866241  '), '399335389161866241'); ok('parse trims whitespace')
assert.equal(parseWokwiId('not a url'), null); ok('parse rejects junk')
assert.equal(parseWokwiId(''), null); ok('parse rejects empty')
assert.equal(idToProjectUrl('123456789'), 'https://wokwi.com/projects/123456789'); ok('id -> url')

// — hashDiagram (stable across key order) —
const d1 = { version: 1, parts: [{ type: 'a', id: 'x' }], connections: [['nano:D13', 'bb1:1t.a', 'red', []]] }
const d2 = { connections: [['nano:D13', 'bb1:1t.a', 'red', []]], parts: [{ id: 'x', type: 'a' }], version: 1 }
assert.equal(hashDiagram(d1), hashDiagram(d2)); ok('hash is key-order stable')
const d3 = { ...d1, connections: [['nano:D12', 'bb1:1t.a', 'red', []]] }
assert.notEqual(hashDiagram(d1), hashDiagram(d3)); ok('hash detects a changed connection')

// — mapPinName (ported from JumperlessWokwiBridge.py) —
assert.equal(mapPinName('nano:D13'), '83'); ok('nano:D13 -> 83')      // 13 + 70
assert.equal(mapPinName('nano:13'), '83'); ok('nano:13 -> 83')
assert.equal(mapPinName('nano:A0'), '86'); ok('nano:A0 -> 86')        // 0 + 86
assert.equal(mapPinName('nano:A5'), '91'); ok('nano:A5 -> 91')
assert.equal(mapPinName('nano:GND'), '100'); ok('nano:GND -> 100')
assert.equal(mapPinName('nano:5V'), '105'); ok('nano:5V -> 105')
assert.equal(mapPinName('nano:AREF'), '85'); ok('nano:AREF -> 85')
assert.equal(mapPinName('bb1:5t.a'), '5'); ok('bb1 top row -> 5')
assert.equal(mapPinName('bb1:5b.h'), '35'); ok('bb1 bottom row -> 35')  // 5 + 30
assert.equal(mapPinName('bb1:1n.1'), '100'); ok('bb1 negative rail -> 100 (GND)')
assert.equal(mapPinName('bb1:tp.1', true), '101'); ok('bb1 top + rail (v5) -> 101')
assert.equal(mapPinName('bb1:tp.1', false), '105'); ok('bb1 top + rail (v4) -> 105')
assert.equal(mapPinName('pot1:SIG'), '106'); ok('pot1:SIG -> 106')
assert.equal(mapPinName('logic1:3'), '113'); ok('logic1:3 -> 113')
assert.equal(mapPinName('unknown:thing'), 'unknown:thing'); ok('unknown pin passes through')

// — constructNetlist —
const conns = [['nano:D13', 'bb1:5t.a', 'red', []], ['nano:GND', 'bb1:1n.1', 'black', []], ['x:bad', 'y:bad', 'g', []]]
assert.equal(constructNetlist(conns), '{ 83-5,100-100, }'); ok('netlist maps + drops unmapped pairs')
assert.equal(constructNetlist([]), '{ }'); ok('empty netlist')

// — buildWokwiCommand (newline terminates the W command line) —
const cmd = buildWokwiCommand(3, d1)
assert.ok(cmd.startsWith('W 3\n'), 'command starts with "W 3\\n"'); ok('command prefix + newline')
assert.equal(cmd.slice('W 3\n'.length), JSON.stringify(d1)); ok('command carries compact JSON')

console.log(`\nAll ${n} Wokwi helper checks passed.`)
