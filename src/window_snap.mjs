/*
 * Pure geometry helpers for the floating-window snapping + layout presets.
 *
 * Kept dependency-free (no WinBox, no DOM) so the math can be unit-checked under
 * plain Node (scripts/windows.test.mjs). windows.js wires these to live windows.
 */

export const SNAP_THRESHOLD = 28   // px from a viewport edge to trigger a zone

/**
 * Map a snap zone name to pixel geometry within a viewport rect.
 * @param {string|null} zone
 * @param {{x:number,y:number,width:number,height:number}} vp
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export function snapZoneToGeometry(zone, vp) {
    if (!zone) return null
    const halfW = Math.round(vp.width / 2)
    const halfH = Math.round(vp.height / 2)
    const right = vp.x + halfW
    const bottom = vp.y + halfH
    switch (zone) {
        case 'maximize': return { x: vp.x, y: vp.y, width: vp.width, height: vp.height }
        case 'left': return { x: vp.x, y: vp.y, width: halfW, height: vp.height }
        case 'right': return { x: right, y: vp.y, width: vp.width - halfW, height: vp.height }
        case 'bottom': return { x: vp.x, y: bottom, width: vp.width, height: vp.height - halfH }
        case 'top-left': return { x: vp.x, y: vp.y, width: halfW, height: halfH }
        case 'top-right': return { x: right, y: vp.y, width: vp.width - halfW, height: halfH }
        case 'bottom-left': return { x: vp.x, y: bottom, width: halfW, height: vp.height - halfH }
        case 'bottom-right': return { x: right, y: bottom, width: vp.width - halfW, height: vp.height - halfH }
        default: return null
    }
}

/** Determine the snap zone for a pointer position inside a viewport. */
export function pointerSnapZone(px, py, vw, vh, threshold = SNAP_THRESHOLD) {
    const nearL = px <= threshold
    const nearR = px >= vw - threshold
    const nearT = py <= threshold
    const nearB = py >= vh - threshold
    if (nearT && nearL) return 'top-left'
    if (nearT && nearR) return 'top-right'
    if (nearB && nearL) return 'bottom-left'
    if (nearB && nearR) return 'bottom-right'
    if (nearT) return 'maximize'
    if (nearL) return 'left'
    if (nearR) return 'right'
    if (nearB) return 'bottom'
    return null
}

/**
 * Compute tile geometries for `n` windows in a preset arrangement.
 * @param {number} n
 * @param {'2up'|'3col'|'grid'} mode
 * @param {{x:number,y:number,width:number,height:number}} vp
 * @returns {Array<{x:number,y:number,width:number,height:number}>}
 */
export function tileGeometry(n, mode, vp) {
    if (n <= 0) return []
    let cols
    if (mode === '2up') cols = Math.min(2, n)
    else if (mode === '3col') cols = Math.min(3, n)
    else cols = Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const cw = Math.floor(vp.width / cols)
    const ch = Math.floor(vp.height / rows)
    const out = []
    for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols)
        const c = i % cols
        out.push({ x: vp.x + c * cw, y: vp.y + r * ch, width: cw, height: ch })
    }
    return out
}
