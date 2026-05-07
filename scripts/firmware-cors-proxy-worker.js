/*
 * Tiny Cloudflare Worker that proxies arbitrary HTTPS URLs and adds an open
 * CORS header. Used by JumperIDE to fetch firmware binaries from GitHub
 * release assets (or any other host that doesn't set CORS) when public
 * proxies are rate-limited or down.
 *
 * Deploy:
 *   npx wrangler deploy scripts/firmware-cors-proxy-worker.js \
 *     --name jumperide-firmware-proxy \
 *     --compatibility-date 2026-01-01
 *
 * Then point JumperIDE at it from the browser console (persists in window):
 *   window.JUMPERIDE_FIRMWARE_PROXY = 'https://jumperide-firmware-proxy.<sub>.workers.dev/?url='
 *
 * Optionally lock down ALLOWED_ORIGINS / ALLOWED_HOSTS below before deploying.
 */

const ALLOWED_ORIGINS = ['*']                       // restrict to your IDE origin if you like
const ALLOWED_HOSTS = ['github.com', 'objects.githubusercontent.com', 'api.github.com']

function corsHeaders(req) {
    const origin = req.headers.get('Origin') || '*'
    const ok = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)
    return {
        'Access-Control-Allow-Origin': ok ? (origin === '*' ? '*' : origin) : 'null',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Type, ETag',
        'Access-Control-Max-Age': '86400',
    }
}

export default {
    async fetch(req) {
        if (req.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(req) })
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return new Response('Method not allowed', { status: 405, headers: corsHeaders(req) })
        }

        // Accept either ?url=<encoded> or the URL as the rest of the path.
        const u = new URL(req.url)
        let target = u.searchParams.get('url')
        if (!target && u.pathname.length > 1) {
            target = decodeURIComponent(u.pathname.slice(1)) + (u.search || '')
        }
        if (!target) {
            return new Response('Pass ?url=<encoded https URL>', { status: 400, headers: corsHeaders(req) })
        }

        let parsed
        try { parsed = new URL(target) }
        catch { return new Response('Bad target URL', { status: 400, headers: corsHeaders(req) }) }

        if (parsed.protocol !== 'https:') {
            return new Response('Only https targets allowed', { status: 400, headers: corsHeaders(req) })
        }
        if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
            return new Response('Host not allowlisted', { status: 403, headers: corsHeaders(req) })
        }

        const upstream = await fetch(parsed.toString(), {
            method: req.method,
            headers: req.headers.get('Range') ? { Range: req.headers.get('Range') } : {},
            redirect: 'follow',
        })

        const headers = new Headers(corsHeaders(req))
        for (const [k, v] of upstream.headers) {
            // Pass through useful ones; skip cookies and CORS headers we set ourselves.
            if (/^content-(type|length|encoding|range)$|^etag$|^last-modified$|^accept-ranges$/i.test(k)) {
                headers.set(k, v)
            }
        }
        return new Response(upstream.body, { status: upstream.status, headers })
    },
}
