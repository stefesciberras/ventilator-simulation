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
const respiratoryRuntime = read('src/edumon/respiratoryRuntime.ts')

assert(app.includes('function EdumonMonitor({ module }'), 'Ana and ICU must continue to render through one shared EdumonMonitor composition')
assert(app.includes('return <EdumonMonitor module={EDUMON_MODULES[moduleId]} />'), 'module routing must select configuration, not a separate product monitor implementation')
assert(profile.includes("waveforms: ['ecg', 'arterial-pressure', 'pleth', 'capnography']"), 'common profile must own the common waveform family including future capnography')
assert(profile.includes("measurements: ['heart-rate', 'arterial-pressure', 'spo2', 'nibp', 'etco2']"), 'common profile must own shared monitor measurements')
assert(profile.includes('respiratoryPhysiology: true'), 'common profile must declare shared respiratory physiology')
assert(modules.includes('monitorProfile: EDUMON_PRODUCT_MONITOR_PROFILES.ana'), 'EDUMON-Ana must bind to the shared monitor profile')
assert(modules.includes('monitorProfile: EDUMON_PRODUCT_MONITOR_PROFILES.icu'), 'EDUMON-ICU must bind to the shared monitor profile')
assert(monitorEngine.includes('export function generateMonitorSamples'), 'common EDUMON waveform engine must remain product-neutral')
assert(respiratoryRuntime.includes("../core/physiology/respiratory"), 'common EDUMON respiratory runtime must continue to consume EDUSIM respiratory physiology')
assert(!fs.existsSync('src/edumon/ana/monitorEngine.ts'), 'EDUMON-Ana must not grow a duplicate monitor engine')
assert(!fs.existsSync('src/edumon/icu/monitorEngine.ts'), 'EDUMON-ICU must not grow a duplicate monitor engine')

if (!process.exitCode) console.log('EDUMON Ana/ICU common monitor architecture regression checks passed')
