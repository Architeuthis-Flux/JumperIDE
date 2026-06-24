/*
 * Self-check for Jumperless port selection (src/jumperless_ports.mjs).
 * Run: node scripts/ports.test.mjs
 *
 * Focus: selection is keyed on usbInterfaceNumber, NEVER on getPorts() order
 * (Windows returns ports out of order with non-sequential COM numbers), the
 * user override wins over the default map, and unresolvable metadata
 * (missing/tied interface numbers) falls through (returns null) rather than
 * guessing — plus withPortFreed disconnect/reconnect ordering.
 */
import assert from 'node:assert/strict'
import {
    JL_USB, JL_IFACE,
    selectByInterface, findGrantedPortIn, effectiveInterface,
    matchesJumperless, registerSerialSession, withPortFreed,
} from '../src/jumperless_ports.mjs'

let n = 0
const ok = (name) => { n++; console.log(`  ok ${name}`) }

// Fake SerialPort: only getInfo() is used by the selection helpers.
const fakePort = (iface, extra = {}) => ({
    getInfo: () => ({ usbVendorId: JL_USB.usbVendorId, usbProductId: JL_USB.usbProductId, usbInterfaceNumber: iface, ...extra }),
})

// — matchesJumperless —
assert.ok(matchesJumperless({ usbVendorId: 0x1D50, usbProductId: 0xACAB })); ok('matches JL VID/PID')
assert.ok(!matchesJumperless({ usbVendorId: 0x2e8a, usbProductId: 0x0003 })); ok('rejects non-JL device')

// — selection by interface, regardless of array order (Windows-style shuffle) —
const main = fakePort(0), uart = fakePort(2), repl = fakePort(4), tui = fakePort(6)
const shuffled = [tui, repl, uart, main]   // deliberately NOT in interface order
assert.equal(findGrantedPortIn(shuffled, 'command'), main); ok('command -> interface 0 (order-independent)')
assert.equal(findGrantedPortIn(shuffled, 'flash'), uart); ok('flash -> interface 2 (order-independent)')

// A second shuffle yields the same answer (proves it is not positional).
assert.equal(findGrantedPortIn([uart, main, tui, repl], 'flash'), uart); ok('flash stable under a different order')

// — non-JL ports are ignored even if their interface number "matches" —
const intruder = { getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0x5678, usbInterfaceNumber: 0 }) }
assert.equal(findGrantedPortIn([intruder, main], 'command'), main); ok('non-JL iface-0 ignored')

// — override wins over the default map —
assert.equal(effectiveInterface('command'), JL_IFACE.command); ok('default command interface')
assert.equal(effectiveInterface('command', { command: 4 }), 4); ok('override changes effective interface')
assert.equal(findGrantedPortIn(shuffled, 'command', { command: 4 }), repl); ok('override routes command -> interface 4')

// — unresolvable metadata returns null (caller falls back to the picker) —
const noMeta = fakePort(undefined)
assert.equal(selectByInterface([noMeta], 0), null); ok('undefined interface -> null (no order guess)')
const tieA = fakePort(2), tieB = fakePort(2)
assert.equal(selectByInterface([tieA, tieB], 2), null); ok('tied interfaces -> null')
assert.equal(selectByInterface([main, uart], 99), null); ok('no match -> null')

// — withPortFreed: disconnect (matching only) before fn, reconnect after —
const target = fakePort(2)
const order = []
const matchUnreg = registerSerialSession({
    getPort: () => target,
    disconnect: () => { order.push('disc-match') },
    reconnect: () => { order.push('recon-match') },
})
const otherUnreg = registerSerialSession({
    getPort: () => fakePort(0),   // different endpoint (interface 0) -> untouched
    disconnect: () => { order.push('disc-other') },
    reconnect: () => { order.push('recon-other') },
})
const result = await withPortFreed(target, async () => { order.push('flash'); return 'done' })
assert.equal(result, 'done'); ok('withPortFreed returns fn result')
assert.deepEqual(order, ['disc-match', 'flash', 'recon-match']); ok('disconnect -> flash -> reconnect, only matching session')
matchUnreg(); otherUnreg()

// — withPortFreed with no target just runs fn —
assert.equal(await withPortFreed(null, () => 42), 42); ok('null target runs fn directly')

console.log(`\nAll ${n} Jumperless port-selection checks passed.`)
