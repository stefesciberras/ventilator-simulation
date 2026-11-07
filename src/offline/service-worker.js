/* Build replaces __OFFLINE_MANIFEST__ with a content-verified asset manifest. */
const manifest = __OFFLINE_MANIFEST__
const prefix = 'loppjusim-shell-'
const cacheName = prefix + manifest.version
const paths = new Set(manifest.files.map(file => file.url))
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
async function prepare() {
  const cache = await caches.open(cacheName)
  for (const file of manifest.files) {
    const response = await fetch(file.url, { cache: 'no-store', credentials: 'omit', redirect: 'error' })
    if (!response.ok || await digest(await response.clone().arrayBuffer()) !== file.hash) throw Error('Offline download incomplete')
    await cache.put(file.url, response)
  }
}
self.addEventListener('install', event => {
  event.waitUntil(prepare().catch(async error => { await caches.delete(cacheName); throw error }))
  // Do not skip waiting: an active simulation must keep its current build.
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name)
    // Do not claim existing pages: they may have loaded a different build.
  })())
})
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  const simulatorRoute = url.pathname === '/' || /^\/(edumon|eduvent)(\/|$)/.test(url.pathname)
  // Only the immutable build shell and explicitly listed static assets are cached.
  // API, auth, WebSocket, pairing and remote libraries always bypass this worker.
  const path = request.mode === 'navigate' && simulatorRoute ? manifest.shell : paths.has(url.pathname) ? url.pathname : null
  if (!path) return
  event.respondWith((async () => {
    const cached = await (await caches.open(cacheName)).match(path)
    return cached || fetch(request)
  })())
})
self.addEventListener('message', event => {
  if (event.data?.type !== 'OFFLINE_STATUS') return
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    if (event.data.repair) { try { await prepare() } catch { /* report cache completeness below */ } }
    const complete = (await Promise.all(manifest.files.map(file => cache.match(file.url)))).every(Boolean)
    event.ports[0]?.postMessage({ ready: complete, version: manifest.version })
  })())
})
