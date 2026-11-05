import { defineConfig } from 'vite'
// @ts-ignore Node built-in resolves at build time; this app does not install @types/node.
import { execFileSync } from 'node:child_process'
declare const process: { env: Record<string, string | undefined> }
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

// Capture the actual checked-out revision used by this build (including when
// deployed outside GitHub Actions). The date distinguishes fallback builds.
const buildSha = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || (() => {
  try { return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim() }
  catch { return 'unknown' }
})()
const buildTimestamp = new Date().toISOString()

export default defineConfig({
  plugins: [react(), cloudflare()],
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTimestamp),
  },
})
