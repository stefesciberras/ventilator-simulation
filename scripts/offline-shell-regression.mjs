import { verifyOfflinePage } from '../src/offline/readiness.mjs'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import { buildOfflineShell } from './build-offline-shell.mjs'
import { readLocalSelection, saveLocalSelection } from '../src/session-v2/localSessionPreferences.mjs'
const dir = await mkdtemp(join(tmpdir(), 'loppju-offline-'))
try {
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'index.html'), '<html><script src="/assets/main.js"></script></html>')
  await writeFile(join(dir, 'assets/main.js'), 'console.log("version one")')
  await writeFile(join(dir, 'assets/lazy.js'), 'export default 1')
  await writeFile(join(dir, 'NIBP.svg'), '<svg/>')
  await writeFile(join(dir, '_headers'), 'never cache')
  const manifest = await buildOfflineShell(dir)
  assert.equal(manifest.files.length, 4)
  const bodies = new Map(await Promise.all(manifest.files.map(async f => [f.url, await readFile(join(dir, f.url.slice(1)))])))
  const cachesData = new Map()
  const key = request => new URL(typeof request === 'string' ? request : request.url, 'https://sim.test').pathname
  const caches = {
    async open(name) {
      if (!cachesData.has(name)) cachesData.set(name, new Map())
      const entries = cachesData.get(name)
      return { async put(request, response) { entries.set(key(request), response.clone()) }, async match(request) { return entries.get(key(request))?.clone() } }
    },
    async keys() { return [...cachesData.keys()] }, async delete(name) { return cachesData.delete(name) },
  }
  let online = true, corrupt = false, foreignRedirect = false
  const events = {}
  const context = {
    self: { location: { origin: 'https://sim.test' }, addEventListener: (name, fn) => { events[name] = fn } },
    URL, Response, caches, crypto: webcrypto, Uint8Array,
    fetch: async (request, options) => {
      if (!online) throw Error('offline')
      const path = key(request), body = bodies.get(path)
      if (path.endsWith('.html') && options?.redirect !== 'follow') throw TypeError('Cloudflare 307 rejected')
      const response = new Response(corrupt ? 'wrong deployment' : body, { status: body ? 200 : 404, headers: { 'content-type': path.endsWith('.html') ? 'text/html' : 'text/plain' } })
      Object.defineProperty(response, 'url', { value: foreignRedirect ? 'https://other.test/file' : 'https://sim.test' + path.replace(/\.html$/, '') })
      Object.defineProperty(response, 'redirected', { value: path.endsWith('.html') })
      return response
    },
  }
  const workerSource = await readFile(join(dir, 'offline-sw.js'), 'utf8')
  vm.runInNewContext(workerSource, context)
  const lifecycle = async name => { let completion; events[name]({ waitUntil: p => { completion = p } }); await completion }
  cachesData.set('unrelated-app-cache', new Map())
  cachesData.set('loppjusim-shell-old', new Map())
  await lifecycle('install')
  assert(cachesData.has('loppjusim-shell-old'), 'install must not evict active build')
  await lifecycle('activate')
  assert(cachesData.has('unrelated-app-cache'))
  assert(!cachesData.has('loppjusim-shell-old'))
  const fetchEvent = (url, mode = 'navigate', method = 'GET') => {
    let result
    events.fetch({ request: { url: new URL(url, 'https://sim.test').href, mode, method }, respondWith: response => { result = response } })
    return result
  }
  online = false
  const probeUrl = 'https://sim.test/edumon/ana?sessionV2Preview=1#local-pair=private'
  const proof = options => verifyOfflinePage({ controller: {}, complete: true, version: manifest.version, url: probeUrl, fetcher: async (url, init) => {
    assert.equal(init.cache, 'only-if-cached')
    assert.equal(init.mode, 'same-origin')
    assert(!url.includes('private'))
    return fetchEvent(url, 'same-origin')
  }, ...options })
  assert.equal(await proof({ controller: null }), 'reload')
  assert.equal(await proof({ complete: false }), 'incomplete')
  assert.equal(await proof({}), 'ready')
  assert.equal(await proof({ version: 'wrong-build' }), 'unverified')
  assert.equal(await proof({ fetcher: async () => { throw Error('no controller') } }), 'unverified')
  const navigation = await fetchEvent('/edumon/ana?sessionV2Preview=1')
  assert.equal(navigation.redirected, false, 'cached navigation response must not retain redirect metadata')
  assert.equal(navigation.headers.get('content-type'), 'text/html')
  assert.match(await navigation.text(), /version|script/)
  assert.equal(await (await fetchEvent('/assets/lazy.js', 'cors')).text(), 'export default 1')
  for (const url of ['/api/session-v2/ws', '/api/local-pairing/secret', '/auth/callback?token=secret', 'https://remote.test/assets/main.js']) assert.equal(fetchEvent(url), undefined)
  assert.equal(fetchEvent('/edumon/ana', 'navigate', 'POST'), undefined)
  let status
  const check = async repair => {
    let completion
    events.message({ data: { type: 'OFFLINE_STATUS', repair }, ports: [{ postMessage: value => { status = value } }], waitUntil: p => { completion = p } })
    await completion
  }
  await check(false); assert.equal(status.ready, true)
  cachesData.get('loppjusim-shell-' + manifest.version).delete('/assets/lazy.js')
  await check(false); assert.equal(status.ready, false)
  const shellCache = cachesData.get('loppjusim-shell-' + manifest.version)
  const shellResponse = shellCache.get(manifest.shell)
  shellCache.delete(manifest.shell)
  assert.equal((await fetchEvent('/edumon/ana?offline-shell-check=1', 'same-origin')).status, 503)
  shellCache.set(manifest.shell, shellResponse)
  online = true; await check(true); assert.equal(status.ready, true)
  // A mixed or broken deployment cannot replace a valid active build.
  corrupt = true
  vm.runInNewContext(workerSource.replace(manifest.version, 'broken-build'), { ...context })
  await assert.rejects(lifecycle('install'), /Offline download incomplete/)
  assert(cachesData.has('loppjusim-shell-' + manifest.version))
  assert(!cachesData.has('loppjusim-shell-broken-build'))
  corrupt = false; foreignRedirect = true
  vm.runInNewContext(workerSource.replace(manifest.version, 'foreign-build'), { ...context })
  await assert.rejects(lifecycle('install'), /changed origin/)
  assert(cachesData.has('loppjusim-shell-' + manifest.version))
  await writeFile(join(dir, 'NIBP.svg'), '<svg>changed</svg>')
  const next = await buildOfflineShell(dir)
  assert.notEqual(next.version, manifest.version)
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  saveLocalSelection('local', 'saved-room', storage)
  assert.deepEqual(readLocalSelection(storage), { mode: 'local', sessionId: 'saved-room' })
  saveLocalSelection('peer', 'saved-room', storage)
  assert.equal(readLocalSelection(storage).mode, 'peer', 'candidate must never restore as instructor')
  assert(![...values.values()][0].includes('token'))
  assert.equal(readLocalSelection({ getItem() { throw Error('denied') } }), null)
  saveLocalSelection('local', 'room', { setItem() { throw Error('denied') } })
  console.log('Offline shell integrity, navigation, lazy assets, API exclusion, repair, update isolation and local selection passed')
} finally { await rm(dir, { recursive: true, force: true }) }
