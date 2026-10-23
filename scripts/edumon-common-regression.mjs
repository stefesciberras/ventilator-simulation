import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`EDUMON common regression: ${message}`)
    process.exitCode = 1
  }
}

const app = read('src/edumon/EdumonApp.tsx')
const modules = read('src/edumon/modules.ts')
const profile = read('src/edumon/commonMonitorProfile.ts')
const monitorEngine = read('src/edumon/monitorEngine.ts')
const respiratoryRuntime = read('src/edumon/respiratoryPhysiology.ts')
const workspace = read('src/edumon/EdumonWorkspacePanel.tsx')
const capnography = read('src/edumon/EdumonCapnographySurface.tsx')

assert(app.includes('function EdumonMonitor({ module }'), 'Ana and ICU must continue to render through one shared EdumonMonitor composition')
assert(app.includes('return <EdumonMonitor module={EDUMON_MODULES[moduleId]} />'), 'module routing must select configuration, not a separate product monitor implementation')
assert(profile.includes("waveforms: ['ecg', 'arterial-pressure', 'pleth', 'capnography']"), 'common profile must own the common waveform family including capnography')
assert(profile.includes("measurements: ['heart-rate', 'arterial-pressure', 'spo2', 'nibp', 'etco2']"), 'common profile must own shared monitor measurements')
assert(profile.includes('respiratoryPhysiology: true'), 'common profile must declare shared respiratory physiology')
assert(modules.includes('monitorProfile: EDUMON_PRODUCT_MONITOR_PROFILES.ana'), 'EDUMON-Ana must bind to the shared monitor profile')
assert(modules.includes('monitorProfile: EDUMON_PRODUCT_MONITOR_PROFILES.icu'), 'EDUMON-ICU must bind to the shared monitor profile')
assert(monitorEngine.includes('export function generateMonitorSamples'), 'common EDUMON waveform engine must remain product-neutral')
assert(respiratoryRuntime.includes("../core/physiology/respiratory"), 'common EDUMON respiratory runtime must continue to consume EDUSIM respiratory physiology')
assert(respiratoryRuntime.includes('currentEdumonRespiratorySpO2'), 'pulse oximetry must be able to consume the shared respiratory output')
assert(respiratoryRuntime.includes('maxSpO2: Math.min(respiratory.maxSpO2, state.spo2)'), 'configured SpO2 must act as a ceiling rather than bypass gas exchange')
assert(monitorEngine.includes('currentEdumonRespiratorySpO2(state.spo2)'), 'displayed pulse oximetry must use shared gas-exchange saturation')
assert(workspace.includes('<EdumonCapnographySurface patientState={patientState} />'), 'shared EDUMON workspace must mount capnography once for both products')
assert(capnography.includes('stepEdumonRespiratoryRuntime'), 'capnography must consume the shared EDUMON respiratory runtime')
assert(capnography.includes('estimatedEtCo2MmHg'), 'capnography must derive EtCO2 from shared respiratory physiology')
assert(capnography.includes('breathPhase'), 'capnography must integrate breath phase continuously instead of deriving phase directly from time and RR')
assert(capnography.includes('waveformIsFrozen()'), 'capnography must honour the common waveform freeze control')
assert(capnography.includes('EtCO₂'), 'capnography must expose a common EtCO2 numeric measurement')
assert(!fs.existsSync('src/edumon/ana/monitorEngine.ts'), 'EDUMON-Ana must not grow a duplicate monitor engine')
assert(!fs.existsSync('src/edumon/icu/monitorEngine.ts'), 'EDUMON-ICU must not grow a duplicate monitor engine')
assert(!fs.existsSync('src/edumon/ana/capnographyEngine.ts'), 'EDUMON-Ana must not grow a duplicate capnography engine')
assert(!fs.existsSync('src/edumon/icu/capnographyEngine.ts'), 'EDUMON-ICU must not grow a duplicate capnography engine')

if (!process.exitCode) console.log('EDUMON Ana/ICU common monitor architecture regression checks passed')
