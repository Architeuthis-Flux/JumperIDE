#!/usr/bin/env node
/* eslint-env node */
/**
 * Fetches all scripts from the registry API and writes them into ./scripts/
 * so you can see uploaded scripts in the repo. Run from this directory:
 *   node sync-registry-to-repo.js
 * Optional: REGISTRY_URL=https://... node sync-registry-to-repo.js
 */

const fs = require('fs')
const path = require('path')

const REGISTRY_URL = process.env.REGISTRY_URL || 'https://jumperscripts.kevinc-af9.workers.dev'
const SCRIPTS_DIR = path.join(__dirname, 'scripts')
const MANIFEST_PATH = path.join(SCRIPTS_DIR, '.registry-sync.json')

function slug(name) {
    return (name || 'script')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase() || 'script'
}

async function fetchJSON(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} ${res.status} ${await res.text()}`)
    return res.json()
}

async function main() {
    if (!fs.existsSync(SCRIPTS_DIR)) {
        fs.mkdirSync(SCRIPTS_DIR, { recursive: true })
    }

    console.log('Fetching script list from', REGISTRY_URL + '/scripts')
    const data = await fetchJSON(REGISTRY_URL + '/scripts')
    const list = data && data.scripts
    if (!Array.isArray(list)) {
        console.log('Registry returned unexpected shape (missing scripts array). Keys:', data ? Object.keys(data) : 'null')
        return
    }
    if (list.length === 0) {
        console.log('No scripts in registry (list is empty).')
        return
    }
    console.log('Found', list.length, 'script(s) in registry')

    let idToFile = {}
    let fileMeta = {}
    try {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
        idToFile = manifest.idToFile || {}
        fileMeta = manifest.fileMeta || {}
    } catch {
        // no manifest yet
    }

    const existingFiles = new Set(Object.values(idToFile))

    for (const entry of list) {
        const { id, name } = entry
        const full = await fetchJSON(REGISTRY_URL + '/scripts/' + id)
        const content = full.content ?? ''

        let filename = idToFile[id]
        if (!filename) {
            const base = (slug(name) || 'script') + '.py'
            filename = existingFiles.has(base) ? `${slug(name)}_${id}.py` : base
            idToFile[id] = filename
            existingFiles.add(filename)
        }

        fileMeta[filename] = {
            description: full.description ?? '',
            authorName: full.authorName ?? '',
        }

        const filePath = path.join(SCRIPTS_DIR, filename)
        fs.writeFileSync(filePath, content, 'utf8')
        console.log('  wrote', filename)
    }

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ idToFile, fileMeta }, null, 2) + '\n', 'utf8')
    console.log('Synced', list.length, 'script(s) to', SCRIPTS_DIR)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
