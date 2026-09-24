/*
 * Pure helpers for the Jumperless firmware-update flow: which board is on the
 * other end of the cable, which release asset fits it, and whether a UF2
 * belongs on the chip that is about to be flashed. No DOM, no network, so
 * test/firmware_feed.test.mjs can run it under node.
 */

/** Compare two dotted version strings (e.g. "5.6.6.2"): -1, 0 or 1. */
export function compareVersions(a, b) {
    if (!a || !b) return 0
    const pa = String(a).split(/[.-]/).map(s => parseInt(s, 10) || 0)
    const pb = String(b).split(/[.-]/).map(s => parseInt(s, 10) || 0)
    const len = Math.max(pa.length, pb.length)
    for (let i = 0; i < len; i++) {
        const x = pa[i] || 0
        const y = pb[i] || 0
        if (x < y) return -1
        if (x > y) return 1
    }
    return 0
}

/**
 * 'og' (RP2040, original Jumperless) or 'v5' (RP2350B).
 *
 * The banner is authoritative when it names the OG. Every OG build shipped
 * before the banner fix still calls itself `jumperless-v5 ... rp2350b`, so
 * "rp2350" is never taken as evidence of a V5; the firmware version major is
 * the fallback instead (the OG env remaps it to 1, the V5 is 5).
 */
export function jumperlessBoard(machine, firmwareVersion) {
    const m = String(machine || '').toLowerCase()
    if (m.includes('jumperless-og') || m.includes('rp2040')) return 'og'
    if (parseInt(String(firmwareVersion || ''), 10) === 1) return 'og'
    return 'v5'
}

const OG_ASSET_RE = /^firmware_og_backport\.(\d+(?:\.\d+)+)\.uf2$/i

/**
 * The release asset to flash on `board`, or null if the release has none.
 *
 *   v5: `firmware.uf2` by exact name (the JumperlOS release also carries
 *       firmware-dev.uf2 and the OG image), else the first .uf2 that is
 *       neither of those.
 *   og: the highest-versioned firmware_og_backport.<1.x.y.z>.uf2 (the public
 *       Jumperless release accumulates several). Its version is the one in
 *       the file name, never the release tag: the JumperlOS tag is the V5
 *       number.
 *
 * Returns { name, url, version }; version is null for v5 (the caller has the
 * tag for that).
 */
export function pickJumperlessAsset(board, assets) {
    const list = Array.isArray(assets) ? assets : []
    if (board === 'og') {
        let best = null
        for (const a of list) {
            const m = OG_ASSET_RE.exec(a.name || '')
            if (!m) continue
            if (!best || compareVersions(m[1], best.version) > 0) {
                best = { name: a.name, url: a.browser_download_url, version: m[1] }
            }
        }
        return best
    }
    const exact = list.find(a => a.name === 'firmware.uf2')
    const pick = exact || list.find(a =>
        /\.uf2$/i.test(a.name || '') && !OG_ASSET_RE.test(a.name) && !/-dev\.uf2$/i.test(a.name))
    return pick ? { name: pick.name, url: pick.browser_download_url, version: null } : null
}

// RP2-family UF2 family IDs (from the microsoft/uf2 registry).
export const RP2040_UF2_FAMILY = 0xe48bff56
export const RP2_UF2_FAMILIES = new Set([
    RP2040_UF2_FAMILY,
    0xe48bff57, // RP2350 absolute
    0xe48bff58, // RP2350 data
    0xe48bff59, // RP2350 ARM-S
    0xe48bff5a, // RP2350 RISC-V
    0xe48bff5b, // RP2350 ARM-NS
])

/**
 * Throw unless every UF2 family in `families` runs on the chip in BOOTSEL.
 *
 * Only the MSC drag-and-drop path checks families; PICOBOOT writes whatever
 * it is handed, so an RP2040 image lands on an RP2350 (or the reverse)
 * without complaint and the board then never boots.
 */
export function assertUf2FamiliesMatchChip(families, isRp2040) {
    for (const fam of families) {
        if (!RP2_UF2_FAMILIES.has(fam)) {
            throw new Error(`UF2 family 0x${fam.toString(16)} is not an RP2040/RP2350 family — wrong firmware file?`)
        }
        if ((fam === RP2040_UF2_FAMILY) !== !!isRp2040) {
            throw new Error(isRp2040
                ? 'This is a Jumperless V5 (RP2350) image but the board in BOOTSEL is an OG Jumperless (RP2040). ' +
                  'It needs firmware_og_backport.1.x.y.z.uf2.'
                : 'This is an OG Jumperless (RP2040) image but the board in BOOTSEL is a Jumperless V5 (RP2350). ' +
                  'It needs firmware.uf2.')
        }
    }
}
