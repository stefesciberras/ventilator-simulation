import fs from 'node:fs'

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(before)) throw new Error(`Anchor not found in ${path}: ${before.slice(0, 120)}`)
  fs.writeFileSync(path, source.replace(before, after))
}

replaceExact('src/simulation/engineLegacy.ts', `  volume: number\n  breathStart: number\n`, `  volume: number\n  /** Last applied external PEEP, used to preserve absolute alveolar pressure when the PEEP setting changes. */\n  lastPeep: number | null\n  breathStart: number\n`)
replaceExact('src/simulation/engineLegacy.ts', `    volume: 0,\n    breathStart: -100,\n`, `    volume: 0,\n    lastPeep: null,\n    breathStart: -100,\n`)
replaceExact('src/simulation/engineLegacy.ts', `  const complianceL = Math.max(patient.compliance / 1000, 0.001)\n  const mandatoryCycle = 60 / Math.max(ventilator.rate, 1)\n`, `  const complianceL = Math.max(patient.compliance / 1000, 0.001)\n\n  // state.volume is stored relative to the equilibrium imposed by external PEEP.\n  // Rebase that relative volume whenever PEEP changes so absolute alveolar elastic\n  // pressure is continuous at the instant of the setting change. Subsequent lung\n  // emptying still follows resistance and expiratory flow limitation.\n  if (state.lastPeep == null) {\n    state.lastPeep = ventilator.peep\n  } else if (Math.abs(state.lastPeep - ventilator.peep) > 1e-9) {\n    const previousPeep = state.lastPeep\n    const peepReferenceShiftVolume = (previousPeep - ventilator.peep) * complianceL\n    state.volume = clamp(state.volume + peepReferenceShiftVolume, 0, 2.5)\n    state.lastPeep = ventilator.peep\n  }\n\n  const mandatoryCycle = 60 / Math.max(ventilator.rate, 1)\n`)
replaceExact('src/appVersion.ts', `export const APP_VERSION = '0.83.0.44'\n`, `export const APP_VERSION = '0.83.0.45'\n`)
replaceExact('scripts/core-regression.mjs', `// Existing shared shell / UI ownership regression checks.\n`, `// PEEP/reference-state regression check.\nassert(eduventLegacyEngine.includes('peepReferenceShiftVolume'), 'MV engine must rebase trapped volume when external PEEP changes')\nassert(eduventLegacyEngine.includes('state.lastPeep = ventilator.peep'), 'MV engine must track the applied external PEEP reference')\n\n// Existing shared shell / UI ownership regression checks.\n`)
console.log('Applied v0.83.0.45 total-PEEP reference-state fix')
