/*
 * Self-check for NodeAnchor (src/window_anchor.mjs): mounting a node elsewhere
 * then restoring must return it to its EXACT original parent + position, so the
 * floating-windows overlay is fully reversible.
 *
 * Run: node scripts/windows.test.mjs
 * Uses a tiny DOM mock (no jsdom) — only the methods NodeAnchor relies on.
 */
import assert from 'node:assert/strict'
import { NodeAnchor } from '../src/window_anchor.mjs'
import { snapZoneToGeometry, pointerSnapZone, tileGeometry } from '../src/window_snap.mjs'

// — minimal DOM mock —
class El {
    constructor(name) { this.name = name; this.children = []; this.parentNode = null }
    get nextSibling() {
        if (!this.parentNode) return null
        const i = this.parentNode.children.indexOf(this)
        return this.parentNode.children[i + 1] || null
    }
    appendChild(node) { return this.insertBefore(node, null) }
    insertBefore(node, ref) {
        if (node.parentNode) node.parentNode.removeChild(node)
        const i = ref ? this.children.indexOf(ref) : -1
        if (i < 0) this.children.push(node); else this.children.splice(i, 0, node)
        node.parentNode = this
        return node
    }
    removeChild(node) {
        const i = this.children.indexOf(node)
        if (i >= 0) this.children.splice(i, 1)
        node.parentNode = null
        return node
    }
}

let n = 0
const ok = (name) => { n++; console.log(`  ok ${name}`) }

// Build: parent[ a, target, b ]
const parent = new El('parent')
const a = new El('a'); const target = new El('target'); const b = new El('b')
parent.appendChild(a); parent.appendChild(target); parent.appendChild(b)
assert.deepEqual(parent.children.map(c => c.name), ['a', 'target', 'b'])

// Capture, then "WinBox" moves target into a floating window body.
const anchor = new NodeAnchor(target)
const winBody = new El('winbox-body')
winBody.appendChild(target)
assert.equal(target.parentNode, winBody); ok('node moved out to window body')
assert.deepEqual(parent.children.map(c => c.name), ['a', 'b']); ok('original parent left with a hole')

// Close → restore.
anchor.restore()
assert.equal(target.parentNode, parent); ok('node returned to original parent')
assert.deepEqual(parent.children.map(c => c.name), ['a', 'target', 'b']); ok('restored to exact original index')
assert.equal(winBody.children.length, 0); ok('window body emptied')

// Edge: node was last child (nextSibling === null → append on restore).
const p2 = new El('p2'); const x = new El('x'); const last = new El('last')
p2.appendChild(x); p2.appendChild(last)
const anchor2 = new NodeAnchor(last)
new El('other').appendChild(last)
anchor2.restore()
assert.deepEqual(p2.children.map(c => c.name), ['x', 'last']); ok('last-child round-trips to the end')

// ─── Snap geometry (pure) ────────────────────────────────────────────────────
const vp = { x: 0, y: 48, width: 1000, height: 752 }   // viewport below a 48px toolbar

assert.equal(snapZoneToGeometry(null, vp), null); ok('no zone -> null geometry')
assert.deepEqual(snapZoneToGeometry('left', vp), { x: 0, y: 48, width: 500, height: 752 }); ok('left -> left half')
assert.deepEqual(snapZoneToGeometry('right', vp), { x: 500, y: 48, width: 500, height: 752 }); ok('right -> right half')
assert.deepEqual(snapZoneToGeometry('maximize', vp), { x: 0, y: 48, width: 1000, height: 752 }); ok('maximize -> full viewport')
assert.deepEqual(snapZoneToGeometry('top-left', vp), { x: 0, y: 48, width: 500, height: 376 }); ok('top-left -> quadrant')
assert.deepEqual(snapZoneToGeometry('bottom-right', vp), { x: 500, y: 424, width: 500, height: 376 }); ok('bottom-right -> quadrant')

// Quadrants tile the viewport exactly (no gaps/overlap).
const q = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((z) => snapZoneToGeometry(z, vp))
assert.equal(q[0].width + q[1].width, vp.width); ok('top quadrants span full width')
assert.equal(q[0].height + q[2].height, vp.height); ok('left quadrants span full height')

// ─── Pointer -> zone ─────────────────────────────────────────────────────────
assert.equal(pointerSnapZone(5, 400, 1000, 800), 'left'); ok('pointer near left edge -> left')
assert.equal(pointerSnapZone(995, 400, 1000, 800), 'right'); ok('pointer near right edge -> right')
assert.equal(pointerSnapZone(400, 3, 1000, 800), 'maximize'); ok('pointer near top edge -> maximize')
assert.equal(pointerSnapZone(3, 3, 1000, 800), 'top-left'); ok('pointer in top-left corner -> top-left')
assert.equal(pointerSnapZone(996, 797, 1000, 800), 'bottom-right'); ok('pointer in bottom-right corner -> bottom-right')
assert.equal(pointerSnapZone(500, 400, 1000, 800), null); ok('pointer in the middle -> no zone')

// ─── Layout presets (pure tiling) ────────────────────────────────────────────
const t2 = tileGeometry(2, '2up', vp)
assert.equal(t2.length, 2); ok('2-up makes 2 cells')
assert.deepEqual(t2[0], { x: 0, y: 48, width: 500, height: 752 }); ok('2-up cell 0 is left half')
assert.deepEqual(t2[1], { x: 500, y: 48, width: 500, height: 752 }); ok('2-up cell 1 is right half')

const t3 = tileGeometry(3, '3col', vp)
assert.equal(t3.length, 3); ok('3-col makes 3 cells')
assert.equal(t3[0].width, Math.floor(1000 / 3)); ok('3-col cell width is a third')
assert.equal(t3[1].x, Math.floor(1000 / 3)); ok('3-col cell 1 offset by one column')

const t4 = tileGeometry(4, 'grid', vp)
assert.equal(t4.length, 4); ok('grid makes 4 cells')
assert.deepEqual(t4.map((c) => [c.x, c.y]), [[0, 48], [500, 48], [0, 424], [500, 424]]); ok('grid is a 2x2 arrangement')
assert.deepEqual(tileGeometry(0, 'grid', vp), []); ok('grid of 0 windows is empty')

console.log(`\nAll ${n} window snapping + NodeAnchor checks passed.`)
