import fs from 'node:fs'

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(before)) throw new Error(`Anchor not found in ${path}: ${before}`)
  fs.writeFileSync(path, source.replace(before, after))
}

replaceExact(
  'src/styles.css',
  `.hardware-button { min-height: 48px; border-radius: 7px; background: linear-gradient(#202a31,#151d22); border: 1px solid #3d4d56; box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 2px 3px rgba(0,0,0,.35); font-size: 12px; font-weight: 650; }`,
  `.hardware-button { min-height: 48px; border-radius: 7px; background: linear-gradient(#202a31,#151d22); border: 1px solid #3d4d56; box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 2px 3px rgba(0,0,0,.35); font-size: 12px; font-weight: 650; }\n.hold-button, .hold-button * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }`,
)

replaceExact(
  'src/appVersion.ts',
  `export const APP_VERSION = '0.83.0.47'\n`,
  `export const APP_VERSION = '0.83.0.48'\n`,
)

console.log('Applied v0.83.0.48 hold button touch-selection fix')
