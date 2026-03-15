#!/usr/bin/env node
/* eslint-env node */
/**
 * Pushes edited script files from ./scripts/ back to the registry (updates existing scripts).
 * Only pushes files that are already in .registry-sync.json (i.e. were synced from the registry).
 * Uses each script's stored description/author from the manifest (from the last sync); override with env vars if needed.
 *
 * Usage (from repo root or this directory):
 *   node cloudflare/script-registry-worker/push-repo-to-registry.js
 * Or with overrides: AUTHOR_NAME="You" DESCRIPTION="Override" node push-repo-to-registry.js
 *
 * Optional env: REGISTRY_URL, AUTHOR_NAME (fallback if not in manifest), DESCRIPTION (fallback if not in manifest)
 */

const fs = require('fs')
const path = require('path')

const REGISTRY_URL = process.env.REGISTRY_URL || 'https://jumperscripts.kevinc-af9.workers.dev'
const SCRIPTS_DIR = path.join(__dirname, 'scripts')
const MANIFEST_PATH = path.join(SCRIPTS_DIR, '.registry-sync.json')

async function putJSON(url, body) {
    const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || res.statusText || String(res.status))
    return data
}

function nameFromFilename(filename) {
    return filename.replace(/\.py$/i, '').replace(/_/g, ' ').trim() || 'script'
}

async function main() {
    let idToFile = {}
    let fileMeta = {}
    try {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
        idToFile = manifest.idToFile || {}
        fileMeta = manifest.fileMeta || {}
    } catch (_err) {
        console.error('No .registry-sync.json found. Run sync-registry-to-repo.js first to pull scripts from the registry.')
        process.exit(1)
    }

    const defaultAuthor = (process.env.AUTHOR_NAME || '').trim()
    const defaultDescription = (process.env.DESCRIPTION || '').trim()

    const entries = Object.entries(idToFile)
    if (entries.length === 0) {
        console.log('No scripts in manifest to push.')
        return
    }

    for (const [id, filename] of entries) {
        const filePath = path.join(SCRIPTS_DIR, filename)
        if (!fs.existsSync(filePath)) {
            console.log('  skip', filename, '(file missing)')
            continue
        }
        const meta = fileMeta[filename] || {}
        const authorName = (meta.authorName || defaultAuthor).trim()
        const description = (meta.description || defaultDescription).trim()
        if (!authorName || !description) {
            console.error('  skip', filename, '(missing authorName or description in manifest; set AUTHOR_NAME and DESCRIPTION env or re-run sync)')
            continue
        }
        const content = fs.readFileSync(filePath, 'utf8')
        const name = nameFromFilename(filename)
        try {
            await putJSON(REGISTRY_URL + '/scripts/' + id, {
                name,
                description,
                authorName,
                content,
            })
            console.log('  pushed', filename, '->', id)
        } catch (err) {
            console.error('  failed', filename, err.message)
        }
    }
    console.log('Done.')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
