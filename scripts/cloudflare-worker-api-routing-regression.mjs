import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
assert.equal(config.assets?.not_found_handling, 'single-page-application',
  'React SPA fallback must remain enabled')
assert.deepEqual(config.assets?.run_worker_first, ['/api/*'],
  'all Worker API routes must bypass SPA fallback without invoking Worker for pages')
assert.equal(config.main, './worker/index.ts')
assert.ok(config.durable_objects?.bindings?.some(binding => binding.name === 'SESSION_V2_ROOMS'))
console.log('Cloudflare Worker-first API / SPA routing regression passed')
