/*
 * SPDX-License-Identifier: MIT
 *
 * badgeSync.js — Filesystem diff-sync for the Temporal Replay 2026 badge.
 *
 * Mirrors the Python `firmware/scripts/badge_sync.py` in the badge firmware
 * repo. Both speak the MicroPython raw REPL, both consume the same
 * `firmware/data/manifest.json` from the firmware GitHub repo, both implement
 * the same `list / diff / push / clear` four-step flow.
 *
 * Use case: after a firmware-only reflash the badge's `app0` is updated but
 * the FATFS partition is untouched. If `firmware/data/` upstream has changed
 * (new apps, doc updates, etc.) the operator can press "Sync Filesystem" to
 * pull the diff onto the badge over USB without doing a full `fatfs.bin`
 * reflash that would wipe user uploads.
 *
 * Storage model (mental cheat sheet):
 *   - NVS state (badge ID, contacts, badgeInfo, badge.kv saves) is invariant
 *     across every flash type. This module never touches it.
 *   - FATFS files (Python source, docs, images) are what this module syncs.
 *   - The `extras` bucket (files on the badge but not in the manifest) is
 *     **preserved by default** — if you want to delete user uploads, pass
 *     `clearExtras: true`.
 *
 * See firmware/docs/STORAGE-MODEL.md in the badge repo for the full
 * survival matrix.
 */

import { MpRawMode } from "./rawmode"

const DEFAULT_MANIFEST_URL =
    "https://raw.githubusercontent.com/Architeuthis-Flux/Temporal-Replay-26-Badge/main/firmware/initial_filesystem/manifest.json"

// FNV-1a 32-bit. Matches the C++/Python implementations exactly.
function fnv1a32(bytes) {
    let h = 0x811C9DC5 >>> 0
    for (let i = 0; i < bytes.length; ++i) {
        h ^= bytes[i]
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h >>> 0
}

function bytesToHex(b) {
    return [...b].map(x => x.toString(16).padStart(2, "0")).join("")
}

/* ── Manifest fetch ───────────────────────────────────────────────────── */

export async function loadManifest(url = DEFAULT_MANIFEST_URL) {
    const resp = await fetch(url, { cache: "reload" })
    if (!resp.ok) throw new Error(`manifest HTTP ${resp.status}`)
    const json = await resp.json()
    const out = new Map()
    for (const f of json.files || []) {
        out.set(f.path, {
            path: f.path,
            size: f.size,
            sha256: f.sha256 || "",
            fnv1a32:
                typeof f.fnv1a32 === "string"
                    ? parseInt(f.fnv1a32.replace(/^0x/i, ""), 16)
                    : f.fnv1a32 | 0,
            url: f.url,
            baked: !!f.baked,
        })
    }
    return out
}

/* ── List badge FATFS ─────────────────────────────────────────────────── */

const LIST_SCRIPT = `
def _fnv(p):
 h=0x811C9DC5
 try:
  with open(p,'rb') as f:
   while True:
    b=f.read(256)
    if not b: break
    for x in b:
     h^=x; h=(h*0x01000193)&0xFFFFFFFF
 except: return None
 return h
def _walk(d):
 try: it=os.ilistdir(d)
 except OSError: return
 for n,t,_,*sz in it:
  if n.startswith('.') or n.endswith('.tmp'): continue
  fp=d.rstrip('/')+'/'+n if d!='/' else '/'+n
  if t&0x4000:
   _walk(fp)
  else:
   sb=sz[0] if sz else 0
   try: sb=os.stat(fp)[6]
   except: pass
   h=_fnv(fp)
   if h is not None: print('f|%s|%d|0x%08X'%(fp,sb,h))
_walk('/')
print('OK|done')
`

export async function listBadge(raw) {
    const out = await raw.exec(LIST_SCRIPT, 60000)
    const files = []
    for (const line of out.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("f|")) continue
        const parts = trimmed.split("|")
        if (parts.length < 4) continue
        files.push({
            path: parts[1],
            size: parseInt(parts[2], 10) | 0,
            fnv1a32: parseInt(parts[3].replace(/^0x/i, ""), 16) >>> 0,
        })
    }
    return files
}

/* ── Diff ─────────────────────────────────────────────────────────────── */

export function diff(badgeFiles, manifest) {
    const byPath = new Map(badgeFiles.map(f => [f.path, f]))
    const missing = []
    const stale = []
    const unchanged = []
    for (const m of manifest.values()) {
        const b = byPath.get(m.path)
        if (!b) {
            missing.push(m)
        } else if (b.fnv1a32 !== (m.fnv1a32 >>> 0) || b.size !== m.size) {
            stale.push({ ...m, badge: b })
        } else {
            unchanged.push(m)
        }
    }
    const extras = []
    for (const [path, b] of byPath) {
        if (!manifest.has(path)) extras.push(b)
    }
    return { missing, stale, unchanged, extras }
}

/* ── Push / clear ─────────────────────────────────────────────────────── */

async function fetchBytes(url) {
    const resp = await fetch(url, { cache: "reload" })
    if (!resp.ok) throw new Error(`fetch ${url} HTTP ${resp.status}`)
    const buf = await resp.arrayBuffer()
    return new Uint8Array(buf)
}

async function ensureParentDir(raw, path) {
    const idx = path.lastIndexOf("/")
    if (idx <= 0) return
    const parent = path.slice(0, idx)
    if (!parent) return
    await raw.makePath(parent)
}

export async function pushFile(raw, manifestEntry, onProgress) {
    const data = await fetchBytes(manifestEntry.url)
    // Local hash sanity check — if upstream raw differs from the
    // manifest, prefer to bail rather than write corrupt data.
    if (manifestEntry.fnv1a32 !== fnv1a32(data)) {
        throw new Error(
            `${manifestEntry.path}: hash mismatch between manifest and upstream raw`,
        )
    }
    await ensureParentDir(raw, manifestEntry.path)
    await raw.writeFile(manifestEntry.path, data)
    if (onProgress) onProgress(manifestEntry.path, data.length, data.length)
}

export async function clearFile(raw, path) {
    await raw.removeFile(path)
}

/* ── High-level sync ──────────────────────────────────────────────────── */

/**
 * Run a full diff sync. Caller owns the transport lifecycle (you should
 * already have a connected port in raw mode-capable state).
 *
 *   const raw = await MpRawMode.begin(port)
 *   try {
 *     const result = await runSync(raw, {
 *       manifestUrl: ...,           // optional override
 *       pushMissing: true,          // default
 *       pushStale: true,            // default
 *       clearExtras: false,         // default — preserve user uploads
 *       clearStale: false,
 *       onProgress: (path, bytes, total) => { ... },
 *     })
 *   } finally {
 *     await raw.end()
 *   }
 */
export async function runSync(raw, opts = {}) {
    const {
        manifestUrl = DEFAULT_MANIFEST_URL,
        pushMissing = true,
        pushStale = true,
        clearExtras = false,
        clearStale = false,
        onProgress,
    } = opts

    const manifest = await loadManifest(manifestUrl)
    const badge = await listBadge(raw)
    const plan = diff(badge, manifest)

    const pushed = []
    const cleared = []
    const skipped = []
    const errors = []

    const toPush = []
    if (pushMissing) toPush.push(...plan.missing)
    else skipped.push(...plan.missing.map(m => m.path))
    if (pushStale) toPush.push(...plan.stale)
    else if (!clearStale) skipped.push(...plan.stale.map(m => m.path))

    for (const entry of toPush) {
        try {
            await pushFile(raw, entry, onProgress)
            pushed.push(entry.path)
        } catch (err) {
            errors.push(`push ${entry.path}: ${err.message || err}`)
        }
    }

    const toClear = []
    if (clearExtras) toClear.push(...plan.extras.map(b => b.path))
    if (clearStale) toClear.push(...plan.stale.map(m => m.path))

    for (const path of toClear) {
        try {
            await clearFile(raw, path)
            cleared.push(path)
        } catch (err) {
            errors.push(`clear ${path}: ${err.message || err}`)
        }
    }

    return { plan, pushed, cleared, skipped, errors, ok: errors.length === 0 }
}

/* ── Convenience wrapper ──────────────────────────────────────────────── */

/**
 * Self-contained: open raw mode, run sync, close raw mode. Use this when
 * you don't already have an active MpRawMode instance.
 */
export async function syncBadge(port, opts = {}) {
    const raw = await MpRawMode.begin(port)
    try {
        return await runSync(raw, opts)
    } finally {
        try {
            await raw.end()
        } catch (_) {
            /* ignore */
        }
    }
}
