import fs from 'node:fs'

function replaceOne(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`)
  return text.replace(from, to)
}

const appPath = 'src/App.tsx'
let app = fs.readFileSync(appPath, 'utf8')
app = replaceOne(
  app,
  `  useEffect(() => {\n    if (teachingSession.role !== 'standalone') return\n    const rawKey = new URLSearchParams(window.location.search).get('session') ?? ''\n    const deepLinkKey = rawKey.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)\n    if (deepLinkKey.length !== 6) return\n    setControlTab('teaching')\n    setMobileWorkspacePage('settings')\n  }, [teachingSession.role])`,
  `  useEffect(() => {\n    if (teachingSession.role !== 'standalone') return\n    const rawKey = new URLSearchParams(window.location.search).get('session') ?? ''\n    const deepLinkKey = rawKey.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)\n    if (deepLinkKey.length !== 6) return\n    setControlTab('teaching')\n    setMobileWorkspacePage('settings')\n  }, [teachingSession.role])\n\n  useEffect(() => {\n    if (teachingSession.role !== 'candidate') return\n    const compactWorkspace = window.matchMedia('(max-width: 1180px)').matches\n      || document.body.classList.contains('eduvent-tablet-landscape')\n    if (compactWorkspace) setMobileWorkspacePage('ventilator')\n  }, [teachingSession.role])`,
  'candidate post-join workspace effect',
)
fs.writeFileSync(appPath, app)

const versionPath = 'src/appVersion.ts'
let version = fs.readFileSync(versionPath, 'utf8')
version = replaceOne(version, "export const APP_VERSION = '0.82.9.9'", "export const APP_VERSION = '0.83.0.0'", 'version bump')
fs.writeFileSync(versionPath, version)

console.log('Applied v0.83.0.0 candidate mobile/tablet post-join ventilator view')
