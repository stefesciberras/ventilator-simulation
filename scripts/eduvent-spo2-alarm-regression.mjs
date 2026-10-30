import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

function assertIncludes(fragment, message) {
  if (!source.includes(fragment)) throw new Error(`EDUVENT SpO2 alarm regression: ${message}`)
}

assertIncludes(
  "const spo2LowAlarmActive = latestSample?.spo2 != null && latestSample.spo2 < 85",
  'critical SpO2 threshold must remain aligned with the red metric threshold (<85%)',
)

assertIncludes(
  "spo2Low: spo2LowAlarmActive",
  'low SpO2 must participate in the alarm lifecycle/onset tracking',
)

assertIncludes(
  "{ key: 'spo2Low', label: 'LOW SpO₂', active: spo2LowAlarmActive, priority: 'critical', immediateCritical: true }",
  'low SpO2 must be an immediate critical shared alarm so it drives the red top banner and red audible level',
)

assertIncludes(
  "const spo2MetricAlarm: MetricAlarmLevel = spo2LowAlarmActive ? 'red' : null",
  'the displayed SpO2 value and top-bar alarm must use the same active condition',
)

console.log('EDUVENT SpO2 critical alarm regression checks passed')
