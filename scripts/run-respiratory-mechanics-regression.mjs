import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const tempDirectory = await mkdtemp(path.join(tmpdir(), 'eduvent-mechanics-regression-'))

const regressions = [
  'scripts/respiratory-mechanics-regression.ts',
  'scripts/simv-mechanics-regression.ts',
]

try {
  for (const [index, entryPoint] of regressions.entries()) {
    const outfile = path.join(tempDirectory, `regression-${index}.mjs`)
    await build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      logLevel: 'silent',
    })
    await import(`${pathToFileURL(outfile).href}?run=${Date.now()}-${index}`)
  }
} finally {
  await rm(tempDirectory, { recursive: true, force: true })
}
