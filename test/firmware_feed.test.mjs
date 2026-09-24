/*
 * The OG Jumperless and the V5 share one update flow but not one image: the
 * JumperlOS release ships the V5 firmware.uf2 next to a versioned OG asset,
 * and the public Jumperless release accumulates several OG assets. These
 * pin down which asset each board gets, how a board is recognised (including
 * OG builds whose banner still claims to be a V5), and the chip-vs-image
 * guard in front of the PICOBOOT flasher.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
    compareVersions, jumperlessBoard, pickJumperlessAsset,
    assertUf2FamiliesMatchChip, RP2040_UF2_FAMILY,
} from '../src/firmware_feed.mjs'

const asset = (name) => ({ name, browser_download_url: `https://example.test/${name}` })

// Asset lists as the GitHub API returns them today (2026-09-23).
const JUMPERLOS_5_7_11_3 = [
    asset('firmware-dev.uf2'),
    asset('firmware.uf2'),
    asset('firmware_og_backport.1.7.11.3.uf2'),
]
const JUMPERLESS_1_3_23 = [
    asset('firmware.uf2'),
    asset('firmware_og_backport.1.7.11.2.uf2'),
    asset('firmware_og_backport.1.7.11.3.uf2'),
    asset('original_firmware.uf2'),
]

test('board: the new OG banner names itself', () => {
    assert.equal(jumperlessBoard('jumperless-og with rp2040', '1.7.11.4'), 'og')
})

test('board: OG builds shipped before the banner fix claim to be a V5, so the version major decides', () => {
    assert.equal(jumperlessBoard('jumperless-v5 with rp2350b', '1.7.11.3'), 'og')
    assert.equal(jumperlessBoard('jumperless-v5 with rp2350b', '5.7.11.3'), 'v5')
})

test('board: no version and a V5 banner is a V5; nothing at all is a V5', () => {
    assert.equal(jumperlessBoard('jumperless-v5 with rp2350b', null), 'v5')
    assert.equal(jumperlessBoard(undefined, undefined), 'v5')
})

test('v5 asset: the exact firmware.uf2, never firmware-dev.uf2 or the OG image', () => {
    const a = pickJumperlessAsset('v5', JUMPERLOS_5_7_11_3)
    assert.equal(a.name, 'firmware.uf2')
    assert.equal(a.version, null)
    const b = pickJumperlessAsset('v5', [asset('firmware-dev.uf2'), asset('firmware_og_backport.1.7.11.3.uf2'), asset('build.uf2')])
    assert.equal(b.name, 'build.uf2')
    assert.equal(pickJumperlessAsset('v5', [asset('firmware-dev.uf2')]), null)
})

test('og asset: the highest firmware_og_backport version, with the version read from the name', () => {
    const a = pickJumperlessAsset('og', JUMPERLESS_1_3_23)
    assert.equal(a.name, 'firmware_og_backport.1.7.11.3.uf2')
    assert.equal(a.version, '1.7.11.3')
    assert.equal(a.url, 'https://example.test/firmware_og_backport.1.7.11.3.uf2')
    const reversed = pickJumperlessAsset('og', [...JUMPERLESS_1_3_23].reverse())
    assert.equal(reversed.version, '1.7.11.3')
})

test('og asset: a release without one offers nothing, not the V5 image', () => {
    assert.equal(pickJumperlessAsset('og', [asset('firmware.uf2'), asset('firmware-dev.uf2')]), null)
    assert.equal(pickJumperlessAsset('og', []), null)
    assert.equal(pickJumperlessAsset('og', undefined), null)
})

test('compareVersions orders four-part versions numerically', () => {
    assert.equal(compareVersions('1.7.11.3', '1.7.11.10'), -1)
    assert.equal(compareVersions('5.7.11.3', '5.7.11.3'), 0)
    assert.equal(compareVersions('1.7.12', '1.7.11.9'), 1)
})

// Families as read from the built images: OG firmware.uf2 carries only
// 0xe48bff56, V5 firmware.uf2 only 0xe48bff59 (RP2350 ARM-S).
test('family guard: each image passes on its own chip', () => {
    assert.doesNotThrow(() => assertUf2FamiliesMatchChip([RP2040_UF2_FAMILY], true))
    assert.doesNotThrow(() => assertUf2FamiliesMatchChip([0xe48bff59], false))
})

test('family guard: the cross fails both ways, naming the fix', () => {
    assert.throws(() => assertUf2FamiliesMatchChip([0xe48bff59], true), /firmware_og_backport/)
    assert.throws(() => assertUf2FamiliesMatchChip([RP2040_UF2_FAMILY], false), /firmware\.uf2/)
})

test('family guard: a non-RP2 family is rejected before the chip check', () => {
    assert.throws(() => assertUf2FamiliesMatchChip([0x1c5f21b0], true), /not an RP2040\/RP2350 family/)
})
