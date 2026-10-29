import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const tempDirectory = await mkdtemp(path.join(tmpdir(), 'eduvent-mechanics-regression-'))
const outfile = path.join(tempDirectory, 'regression.mjs')

try {
  await build({
    entryPoints: ['scripts/respiratory-mechanics-regression.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'silent',
  })
  await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`)
} finally {
  await rm(tempDirectory, { recursive: true, force: true })
}
