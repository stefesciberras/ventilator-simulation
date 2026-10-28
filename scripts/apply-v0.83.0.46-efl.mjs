import fs from 'node:fs'

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(before)) throw new Error(`Anchor not found in ${path}: ${before.slice(0, 160)}`)
  fs.writeFileSync(path, source.replace(before, after))
}

replaceExact(
  'src/components/Controls.tsx',
  `      <Slider label="Expiratory flow limitation" value={Math.round((settings.expiratoryFlowLimitation ?? 0) * 100)} unit="%" min={0} max={100} step={5} onChange={(v) => patch({ expiratoryFlowLimitation: v / 100 })} />`,
  `      <Slider label="EFL severity" value={Number((settings.expiratoryFlowLimitation ?? 0).toFixed(1))} unit="" min={0} max={1} step={0.1} displayValue={(settings.expiratoryFlowLimitation ?? 0).toFixed(1)} onChange={(v) => patch({ expiratoryFlowLimitation: v })} />`,
)

replaceExact(
  'src/appVersion.ts',
  `export const APP_VERSION = '0.83.0.45'\n`,
  `export const APP_VERSION = '0.83.0.46'\n`,
)

replaceExact(
  'scripts/core-regression.mjs',
  `const eduvent = read('src/App.tsx')\n`,
  `const eduvent = read('src/App.tsx')\nconst eduventControls = read('src/components/Controls.tsx')\n`,
)

replaceExact(
  'scripts/core-regression.mjs',
  `assert(expiratoryFlowLimitation.includes('const blendWidth = Math.max(ceilingLs * 0.15, 0.015)'), 'obstructive flow limitation must blend smoothly into its choke-flow envelope')\n`,
  `assert(expiratoryFlowLimitation.includes('const blendWidth = Math.max(ceilingLs * 0.15, 0.015)'), 'obstructive flow limitation must blend smoothly into its choke-flow envelope')\nassert(expiratoryFlowLimitation.includes('const severityGain = Math.pow(severity, 1.4)'), 'EFL severity score must retain graded non-linear strength')\nassert(expiratoryFlowLimitation.includes('const airwayInvolvement = clamp'), 'EFL morphology must distinguish airway involvement from severity')\nassert(expiratoryFlowLimitation.includes('earlyFlowSpikeReliefLs'), 'airway-type EFL must retain the early dog-leg flow morphology')\nassert(eduventControls.includes('label="EFL severity"'), 'patient controls must present EFL as a severity score rather than a percentage')\nassert(eduventControls.includes('max={1} step={0.1}'), 'EFL severity control must use a 0.0-1.0 point scale')\n`,
)

console.log('Applied v0.83.0.46 paper-informed EFL control/model transform')
