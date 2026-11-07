import { useEffect, useState } from 'react'

export function OfflineStatus() {
  const [message, setMessage] = useState('Preparing this device for offline use…')
  const [online, setOnline] = useState(navigator.onLine)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine)
    window.addEventListener('online', changed); window.addEventListener('offline', changed)
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed) }
  }, [])
  useEffect(() => {
    let stopped = false
    const listeners: Array<() => void> = []
    const report = (text: string) => { if (!stopped) setMessage(text) }
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) {
      report('Offline preparation requires the deployed HTTPS app and service worker support.')
      return
    }
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration('/') ?? await navigator.serviceWorker.register('/offline-sw.js', { scope: '/', updateViaCache: 'none' })
      if (stopped) return
      const check = async () => {
        if (registration.waiting) { report('Update downloaded. Finish your session, then close all loppjuSIM tabs and reopen to use it.'); return }
        if (!registration.active) { report('Downloading offline files. Keep this page open until ready.'); return }
        const ready = await new Promise<boolean>(resolve => {
          const channel = new MessageChannel()
          const done = (value: boolean) => { clearTimeout(timer); channel.port1.close(); resolve(value) }
          const timer = window.setTimeout(() => done(false), 30000)
          channel.port1.onmessage = event => done(event.data?.ready === true)
          registration.active!.postMessage({ type: 'OFFLINE_STATUS', repair: retry > 0 && online }, [channel.port2])
        })
        report(ready ? 'Ready for offline use on this device.' : 'Offline files are incomplete. Reconnect to internet and retry preparation.')
      }
      const installing = () => {
        const worker = registration.installing
        if (!worker) return
        const changed = () => {
          if (worker.state === 'redundant') report('Offline download failed. Reconnect to internet and retry preparation.')
          else void check()
        }
        worker.addEventListener('statechange', changed)
        listeners.push(() => worker.removeEventListener('statechange', changed))
      }
      registration.addEventListener('updatefound', installing)
      listeners.push(() => registration.removeEventListener('updatefound', installing))
      installing(); await check()
      if (online) void registration.update().catch(() => {})
    })().catch(() => report('Offline preparation unavailable. Reconnect to internet and retry.'))
    return () => { stopped = true; listeners.forEach(remove => remove()) }
  }, [retry, online])
  return <div role="status" style={{ padding: '8px 0', fontSize: 13 }}>
    <strong>{online ? 'Offline availability: ' : 'Offline: '}</strong>{message}{' '}
    <button type="button" onClick={() => setRetry(value => value + 1)}>Check offline availability</button>
    {!online && <p>Restore the instructor’s saved Local session, then exchange a fresh manual offer/answer with the candidate. Automatic candidate links need internet. Recovery starts paused; press Resume when ready.</p>}
    <p>Keep this browser’s site data to retain offline files and saved sessions. Cloud sessions and online libraries still need internet.</p>
  </div>
}
