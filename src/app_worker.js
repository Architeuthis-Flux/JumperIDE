/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided 'as is', without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purposevent.
 */

const cacheName = `viper-${VIPER_IDE_VERSION}`;

const log = console.log.bind(console).bind(console, `[Service Worker ${VIPER_IDE_VERSION}]`);

// Only assets that exist in build/assets (omit optional wasm/tarballs that may 404)
const contentToCache = new Set([
    '/index.html',
    '/assets/icon409.png',
    '/assets/jumperIDE@0.5x.png',
    '/assets/iconPlay1024.png',
    '/assets/iconStop1024.png',
]);

self.addEventListener('install', event => {
  log('Install');
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const results = await Promise.allSettled(
      [...contentToCache].map(resource =>
        cache.add(new Request(resource, { cache: 'no-store' }))
      )
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        log(`Cache add failed: ${[...contentToCache][i]}`, r.reason?.message ?? r.reason);
      }
    });
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  log('Activate');
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== cacheName) {
        log(`Deleting ${key}`);
        await caches.delete(key);
      }
    }
  })());
});

function normalizeUrl(s) {
  const url = new URL(s);
  if (url.pathname === '/') {
    return new URL('/index.html', url.origin);
  }
  return url;
}

self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const url = normalizeUrl(event.request.url);

    // Network-first for HTML pages — always get the latest deploy,
    // fall back to cache only when offline.
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
      try {
        const rsp = await fetch(event.request, { cache: 'no-store' });
        if (rsp.ok && contentToCache.has(url.pathname)) {
          cache.put(url, rsp.clone());
        }
        return rsp;
      } catch (_) {
        const cached = await cache.match(url);
        if (cached) {
          log(`Offline, using cached: ${url}`);
          return cached;
        }
        throw _;
      }
    }

    // Cache-first for static assets (icons, images)
    const r = await cache.match(url);
    if (r) {
      return r;
    }
    try {
      const rsp = await fetch(event.request);
      if (contentToCache.has(url.pathname)) {
        cache.put(url, rsp.clone());
      }
      return rsp;
    } catch (err) {
      log(err.message);
      throw err;
    }
  })());
});
