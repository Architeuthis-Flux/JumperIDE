/**
 * JumperIDE Shared Script Registry — Cloudflare Worker
 * No-account community: author name + description required; wiki-style edits; immutable history.
 */

const INDEX_KEY = 'scripts:index'
const IMAGES_INDEX_KEY = 'images:index'
const MAX_NAME_LEN = 120
const MAX_DESC_LEN = 500
const MAX_AUTHOR_LEN = 80
const MAX_CONTENT_BYTES = 100 * 1024 // 100 KiB
const MAX_IMAGE_CONTENT_BYTES = 8 * 1024 // 8 KiB decoded for OLED .bin

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
}

function err(message, status = 400) {
    return json({ error: message }, status)
}

function sanitize(str, maxLen) {
    if (typeof str !== 'string') return ''
    return str.trim().slice(0, maxLen)
}

function nanoid() {
    const s = '0123456789abcdefghijklmnopqrstuvwxyz'
    let id = ''
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    for (let i = 0; i < 12; i++) id += s[bytes[i] % 36]
    return id
}

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 30

async function checkRateLimit(env, ip, method) {
    if (method !== 'POST' && method !== 'PUT') return null
    const key = `rate:${ip}`
    const raw = await env.SCRIPTS.get(key)
    const now = Date.now()
    let data = raw ? JSON.parse(raw) : { count: 0, windowStart: now }
    if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
        data = { count: 0, windowStart: now }
    }
    data.count += 1
    await env.SCRIPTS.put(key, JSON.stringify(data), { expirationTtl: 120 })
    if (data.count > RATE_LIMIT_MAX) {
        return err('Too many requests; try again in a minute', 429)
    }
    return null
}

export default {
    async fetch(request, env, _ctx) {
        // Always return CORS so browser doesn't block; OPTIONS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS })
        }

        try {
            if (!env.SCRIPTS) {
                return err('Registry storage not configured', 503)
            }

            const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
            const rateErr = await checkRateLimit(env, ip, request.method)
            if (rateErr) return rateErr

            const url = new URL(request.url)
            const path = url.pathname.replace(/\/$/, '') || '/'
            const segments = path.split('/').filter(Boolean) // ['scripts'|'images', ...]

            if (segments[0] === 'images') {
                const imageId = segments[1]
                const sub = segments[2]           // 'history' or 'revisions'
                const revId = segments[3]
                if (request.method === 'GET' && !imageId) {
                    return await handleListImages(env)
                }
                if (request.method === 'GET' && imageId && !sub) {
                    return await handleGetImage(imageId, env)
                }
                if (request.method === 'GET' && imageId && sub === 'history') {
                    return await handleImageHistory(imageId, env)
                }
                if (request.method === 'GET' && imageId && sub === 'revisions' && revId) {
                    return await handleGetImageRevision(imageId, revId, env)
                }
                if (request.method === 'POST' && !imageId) {
                    return await handleCreateImage(request, env)
                }
                if (request.method === 'PUT' && imageId && !sub) {
                    return await handleUpdateImage(imageId, request, env)
                }
                return err('Not found', 404)
            }

            if (segments[0] !== 'scripts') {
                return err('Not found', 404)
            }

            const id = segments[1]           // script id or undefined
            const sub = segments[2]           // 'history' or 'revisions' or revId
            const revId = segments[3]

            if (request.method === 'GET' && !id) {
                return await handleList(env)
            }
            if (request.method === 'GET' && id && !sub) {
                return await handleGet(id, env)
            }
            if (request.method === 'GET' && id && sub === 'history') {
                return await handleHistory(id, env)
            }
            if (request.method === 'GET' && id && sub === 'revisions' && revId) {
                return await handleGetRevision(id, revId, env)
            }
            if (request.method === 'POST' && !id) {
                return await handleCreate(request, env)
            }
            if (request.method === 'PUT' && id && !sub) {
                return await handleUpdate(id, request, env)
            }
            return err('Not found', 404)
        } catch (e) {
            console.error(e)
            return err(e.message || 'Internal error', 500)
        }
    },
}

async function handleList(env) {
    const raw = await env.SCRIPTS.get(INDEX_KEY)
    const list = raw ? JSON.parse(raw) : []
    return json({ scripts: list })
}

async function handleGet(id, env) {
    const raw = await env.SCRIPTS.get(`script:${id}:current`)
    if (!raw) return err('Script not found', 404)
    const data = JSON.parse(raw)
    return json(data)
}

async function handleHistory(id, env) {
    const raw = await env.SCRIPTS.get(`script:${id}:current`)
    if (!raw) return err('Script not found', 404)
    const current = JSON.parse(raw)
    const revIds = current.revisionIds || []
    const revisions = []
    for (const rid of revIds) {
        const rraw = await env.SCRIPTS.get(`script:${id}:rev:${rid}`)
        if (rraw) {
            const rev = JSON.parse(rraw)
            revisions.push({
                revId: rid,
                authorName: rev.authorName,
                updatedAt: rev.updatedAt,
                name: rev.name,
                description: rev.description,
            })
        }
    }
    revisions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    return json({ revisions })
}

async function handleGetRevision(id, revId, env) {
    const raw = await env.SCRIPTS.get(`script:${id}:rev:${revId}`)
    if (!raw) return err('Revision not found', 404)
    return json(JSON.parse(raw))
}

// ─── OLED images registry ───────────────────────────────────────────────────

async function handleListImages(env) {
    const raw = await env.SCRIPTS.get(IMAGES_INDEX_KEY)
    const list = raw ? JSON.parse(raw) : []
    return json({ images: list })
}

async function handleGetImage(imageId, env) {
    const raw = await env.SCRIPTS.get(`image:${imageId}:current`)
    if (!raw) return err('Image not found', 404)
    return json(JSON.parse(raw))
}

async function handleCreateImage(request, env) {
    let body
    try {
        body = await request.json()
    } catch {
        return err('Invalid JSON body')
    }

    const name = sanitize(body.name || '', MAX_NAME_LEN) || 'Untitled'
    const description = sanitize(body.description || '', MAX_DESC_LEN)
    const authorName = sanitize(body.authorName || '', MAX_AUTHOR_LEN)
    const contentB64 = typeof body.content === 'string' ? body.content.trim() : ''

    if (!authorName) return err('authorName is required')
    if (!contentB64) return err('content is required')

    let decoded
    try {
        decoded = Uint8Array.from(atob(contentB64), (c) => c.charCodeAt(0))
    } catch {
        return err('content must be valid base64')
    }
    if (decoded.length > MAX_IMAGE_CONTENT_BYTES) {
        return err(`Image too large (max ${MAX_IMAGE_CONTENT_BYTES / 1024} KiB)`)
    }

    const id = nanoid()
    const updatedAt = new Date().toISOString()

    const image = {
        id,
        name,
        description,
        authorName,
        content: contentB64,
        updatedAt,
        revisionIds: [],
    }

    const indexEntry = { id, name, description, authorName, updatedAt }

    await env.SCRIPTS.put(`image:${id}:current`, JSON.stringify(image))

    const listRaw = await env.SCRIPTS.get(IMAGES_INDEX_KEY)
    const list = listRaw ? JSON.parse(listRaw) : []
    list.unshift(indexEntry)
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    await env.SCRIPTS.put(IMAGES_INDEX_KEY, JSON.stringify(list))

    return json({ id, ...indexEntry, content: image.content }, 201)
}

async function handleUpdateImage(imageId, request, env) {
    const raw = await env.SCRIPTS.get(`image:${imageId}:current`)
    if (!raw) return err('Image not found', 404)

    let body
    try {
        body = await request.json()
    } catch {
        return err('Invalid JSON body')
    }

    const current = JSON.parse(raw)
    const nameTrim = sanitize(body.name || '', MAX_NAME_LEN).trim().toLowerCase()
    if (nameTrim === 'delete') {
        await env.SCRIPTS.delete(`image:${imageId}:current`)
        const listRaw = await env.SCRIPTS.get(IMAGES_INDEX_KEY)
        let list = listRaw ? JSON.parse(listRaw) : []
        list = list.filter((e) => e.id !== imageId)
        await env.SCRIPTS.put(IMAGES_INDEX_KEY, JSON.stringify(list))
        return json({ deleted: true })
    }

    const authorName = sanitize(body.authorName || '', MAX_AUTHOR_LEN)
    if (!authorName) return err('authorName is required')
    if (authorName !== (current.authorName || '')) {
        return err('Only the author can edit this image', 403)
    }

    const name = sanitize(body.name !== undefined ? body.name : current.name, MAX_NAME_LEN) || current.name
    const description = sanitize(body.description !== undefined ? body.description : current.description, MAX_DESC_LEN)
    let content = typeof body.content === 'string' ? body.content : current.content
    if (content) {
        let decoded
        try {
            decoded = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
        } catch {
            return err('content must be valid base64')
        }
        if (decoded.length > MAX_IMAGE_CONTENT_BYTES) {
            return err(`Image too large (max ${MAX_IMAGE_CONTENT_BYTES / 1024} KiB)`)
        }
    }

    const updatedAt = new Date().toISOString()
    const revId = `${imageId}-${Date.now()}`
    const revisionIds = [...(current.revisionIds || [])]
    revisionIds.push(revId)
    const MAX_REVISIONS = 50
    while (revisionIds.length > MAX_REVISIONS) {
        const old = revisionIds.shift()
        await env.SCRIPTS.delete(`image:${imageId}:rev:${old}`)
    }
    const revisionSnapshot = { ...current, id: imageId }
    delete revisionSnapshot.revisionIds
    await env.SCRIPTS.put(`image:${imageId}:rev:${revId}`, JSON.stringify(revisionSnapshot))

    const image = {
        ...current,
        id: imageId,
        name,
        description,
        authorName,
        content,
        updatedAt,
        revisionIds,
    }

    await env.SCRIPTS.put(`image:${imageId}:current`, JSON.stringify(image))

    const listRaw = await env.SCRIPTS.get(IMAGES_INDEX_KEY)
    let list = listRaw ? JSON.parse(listRaw) : []
    list = list.map((e) => (e.id === imageId ? { id: imageId, name, description, authorName, updatedAt } : e))
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    await env.SCRIPTS.put(IMAGES_INDEX_KEY, JSON.stringify(list))

    return json(image)
}

async function handleImageHistory(imageId, env) {
    const raw = await env.SCRIPTS.get(`image:${imageId}:current`)
    if (!raw) return err('Image not found', 404)
    const current = JSON.parse(raw)
    const revisionIds = current.revisionIds || []
    const revisions = []
    for (const rid of revisionIds.slice().reverse()) {
        const rraw = await env.SCRIPTS.get(`image:${imageId}:rev:${rid}`)
        if (!rraw) continue
        const rev = JSON.parse(rraw)
        revisions.push({
            revId: rid,
            name: rev.name,
            authorName: rev.authorName,
            description: rev.description,
            updatedAt: rev.updatedAt,
        })
    }
    return json({ revisions })
}

async function handleGetImageRevision(imageId, revId, env) {
    const raw = await env.SCRIPTS.get(`image:${imageId}:rev:${revId}`)
    if (!raw) return err('Revision not found', 404)
    return json(JSON.parse(raw))
}

async function handleCreate(request, env) {
    let body
    try {
        body = await request.json()
    } catch {
        return err('Invalid JSON body')
    }

    const name = sanitize(body.name || '', MAX_NAME_LEN) || 'Untitled'
    const description = sanitize(body.description || '', MAX_DESC_LEN)
    const authorName = sanitize(body.authorName || '', MAX_AUTHOR_LEN)
    let content = typeof body.content === 'string' ? body.content : ''

    if (!authorName) return err('authorName is required')
    if (!description) return err('description is required')

    const contentBytes = new TextEncoder().encode(content).length
    if (contentBytes > MAX_CONTENT_BYTES) {
        return err(`Script content too long (max ${MAX_CONTENT_BYTES / 1024} KiB)`)
    }

    const id = nanoid()
    const updatedAt = new Date().toISOString()

    const script = {
        id,
        name,
        description,
        authorName,
        content,
        updatedAt,
        revisionIds: [id + '-0'],
    }

    const indexEntry = { id, name, description, authorName, updatedAt }

    const revKey = `script:${id}:rev:${id}-0`
    const revPayload = { ...script, revId: `${id}-0` }

    await env.SCRIPTS.put(`script:${id}:current`, JSON.stringify(script))

    const listRaw = await env.SCRIPTS.get(INDEX_KEY)
    const list = listRaw ? JSON.parse(listRaw) : []
    list.unshift(indexEntry)
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    await env.SCRIPTS.put(INDEX_KEY, JSON.stringify(list))

    await env.SCRIPTS.put(revKey, JSON.stringify(revPayload))

    return json({ id, ...indexEntry, content: script.content }, 201)
}

async function handleUpdate(id, request, env) {
    const raw = await env.SCRIPTS.get(`script:${id}:current`)
    if (!raw) return err('Script not found', 404)

    let body
    try {
        body = await request.json()
    } catch {
        return err('Invalid JSON body')
    }

    const current = JSON.parse(raw)
    const nameTrim = sanitize(body.name || '', MAX_NAME_LEN).trim().toLowerCase()
    if (nameTrim === 'delete') {
        for (const revId of current.revisionIds || []) {
            await env.SCRIPTS.delete(`script:${id}:rev:${revId}`)
        }
        await env.SCRIPTS.delete(`script:${id}:current`)
        const listRaw = await env.SCRIPTS.get(INDEX_KEY)
        let list = listRaw ? JSON.parse(listRaw) : []
        list = list.filter((e) => e.id !== id)
        await env.SCRIPTS.put(INDEX_KEY, JSON.stringify(list))
        return json({ deleted: true })
    }

    const authorName = sanitize(body.authorName || '', MAX_AUTHOR_LEN)
    if (!authorName) return err('authorName is required')
    const name = sanitize(body.name !== undefined ? body.name : current.name, MAX_NAME_LEN) || current.name
    const description = sanitize(body.description !== undefined ? body.description : current.description, MAX_DESC_LEN)
    let content = typeof body.content === 'string' ? body.content : current.content

    const contentBytes = new TextEncoder().encode(content).length
    if (contentBytes > MAX_CONTENT_BYTES) {
        return err(`Script content too long (max ${MAX_CONTENT_BYTES / 1024} KiB)`)
    }

    const updatedAt = new Date().toISOString()
    const revIds = current.revisionIds || []
    const nextRev = `${id}-${revIds.length}`
    revIds.push(nextRev)

    const script = {
        ...current,
        id,
        name,
        description,
        authorName,
        content,
        updatedAt,
        revisionIds: revIds,
    }

    const revPayload = { id, name, description, authorName, content, updatedAt, revId: nextRev }
    await env.SCRIPTS.put(`script:${id}:current`, JSON.stringify(script))
    await env.SCRIPTS.put(`script:${id}:rev:${nextRev}`, JSON.stringify(revPayload))

    const listRaw = await env.SCRIPTS.get(INDEX_KEY)
    let list = listRaw ? JSON.parse(listRaw) : []
    list = list.map((e) => (e.id === id ? { id, name, description, authorName, updatedAt } : e))
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    await env.SCRIPTS.put(INDEX_KEY, JSON.stringify(list))

    return json(script)
}
