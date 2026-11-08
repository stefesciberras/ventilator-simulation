// Require the current page's controller, complete assets, and a cache-only fetch.
// A successful registration or navigator.onLine alone is insufficient.
export async function verifyOfflinePage({ controller, complete, version, url, fetcher = fetch }) {
  if (!complete) return 'incomplete'
  if (!controller) return 'reload'
  const probe = new URL(url)
  probe.hash = ''
  probe.search = '?offline-shell-check=1'
  try {
    const response = await fetcher(probe.href, { mode: 'same-origin', cache: 'only-if-cached', credentials: 'omit', signal: AbortSignal.timeout(5000) })
    return response.ok && response.headers.get('x-loppjusim-offline-build') === version ? 'ready' : 'unverified'
  } catch { return 'unverified' }
}
