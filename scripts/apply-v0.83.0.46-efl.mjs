import fs from 'node:fs'

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  if (!source.includes(before)) throw new Error(`Anchor not found in ${path}: ${before.slice(0, 160)}`)
  fs.writeFileSync(path, source.replace(before, after))
}

replaceExact(
  'src/components/Controls.tsx',
  `      <Slider label="EFL severity" value={Number((settings.expiratoryFlowLimitation ?? 0).toFixed(1))} unit="" min={0} max={1} step={0.1} displayValue={(settings.expiratoryFlowLimitation ?? 0).toFixed(1)} onChange={(v) => patch({ expiratoryFlowLimitation: v })} />`,
  `      <Slider label="EFL severity" value={Math.round((settings.expiratoryFlowLimitation ?? 0) * 10) / 10} unit="" min={0} max={1} step={0.1} displayValue={(Math.round((settings.expiratoryFlowLimitation ?? 0) * 10) / 10).toFixed(1)} onChange={(v) => patch({ expiratoryFlowLimitation: v })} />`,
)

console.log('Snapped legacy EFL severity values to nearest 0.1')
