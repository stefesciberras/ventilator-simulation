import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'
export async function buildOfflineShell(directory) {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const html = await readFile(resolve(directory, 'index.html'))
  const files = []
  const walk = async path => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const absolute = resolve(path, entry.name), name = relative(directory, absolute).replaceAll('\\', '/')
      if (entry.name.startsWith('.') || entry.name.startsWith('_') || name === 'offline-shell' || name === 'offline-sw.js' || name === 'index.html') continue
      if (entry.isDirectory()) await walk(absolute)
      else if (/\.(js|css|svg|png|jpg|jpeg|webp|gif|woff2?|ico|mp3|wav)$/i.test(name)) files.push({ url: '/' + name, hash: hash(await readFile(absolute)) })
    }
  }
  await walk(directory)
  const template = await readFile(new URL('../src/offline/service-worker.js', import.meta.url), 'utf8')
  const version = hash(Buffer.concat([html, Buffer.from(JSON.stringify(files)), Buffer.from(template)])).slice(0, 24)
  const shell = `/offline-shell/${version}.html`
  await mkdir(resolve(directory, 'offline-shell'), { recursive: true })
  await writeFile(resolve(directory, shell.slice(1)), html)
  files.push({ url: shell, hash: hash(html) })
  const manifest = { version, shell, files }
  await writeFile(resolve(directory, 'offline-sw.js'), template.replace('const manifest = __OFFLINE_MANIFEST__', `const manifest = ${JSON.stringify(manifest)}`))
  console.log(`Offline shell: ${files.length} verified assets (${version})`)
  return manifest
}
if (process.argv[1] === new URL(import.meta.url).pathname) await buildOfflineShell(resolve('dist/client'))
