/*
 * NodeAnchor — captures a DOM node's original location so it can be restored
 * exactly after another library (WinBox) moves it elsewhere.
 *
 * Pure DOM, no dependencies, so the reversibility guarantee of the floating-
 * windows overlay can be unit-checked under plain Node (scripts/windows.test.mjs).
 */
export class NodeAnchor {
    constructor(node) {
        this.node = node
        this.parent = node.parentNode
        this.nextSibling = node.nextSibling
    }
    /** Put the node back where it was. insertBefore(node, null) appends. */
    restore() {
        if (!this.parent) return
        this.parent.insertBefore(this.node, this.nextSibling)
    }
}
