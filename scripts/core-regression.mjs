import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const assert = (condition, message) => {
  if (!condition) {
    console.error(`EDUSIM core regression: ${message}`)
    process.exitCode = 1
  }
}

const eduvent = read('src/App.tsx')
const edumonPanel = read('src/edumon/EdumonWorkspacePanel.tsx')
const edumon = read('src/edumon/EdumonApp.tsx')
const physiology = read('src/components/PhysiologyMeasurementsDialog.tsx')
const scenarioProducts = read('src/teaching/scenario/products.ts')
const registry = read('src/core/products.ts')
const persistence = read('src/core/SimulationPersistence.ts')
const transition = read('src/components/SimulationTransitionTimeControl.tsx')

assert(eduvent.includes('<SimulationControlFramework'), 'EDUVENT must use SimulationControlFramework')
assert(edumonPanel.includes('<SimulationControlFramework'), 'EDUMON must use SimulationControlFramework')
assert(!eduvent.includes('<aside className="control-panel tabbed-control-panel">'), 'EDUVENT must not restore product-owned control-panel chrome')
assert(edumonPanel.includes('showValue={false}'), 'EDUMON transition control must not duplicate the selected duration beside its label')
assert(transition.includes('showValue = true'), 'shared transition control must retain an explicit value-display option')

assert(physiology.includes('<SecondaryMonitorSurface'), 'EDUVENT physiology display must use SecondaryMonitorSurface')
assert(edumon.includes('<SecondaryMonitorSurface'), 'EDUMON auxiliary displays must use SecondaryMonitorSurface')
assert(!edumon.includes('AuxiliaryMonitorModal'), 'EDUMON must not depend on the legacy AuxiliaryMonitorModal wrapper')

assert(scenarioProducts.includes('EDUSIM_PRODUCTS'), 'scenario routing must derive product metadata from the EDUSIM registry')
for (const product of ['eduvent', 'edumon-ana', 'edumon-icu']) {
  assert(registry.includes(`'${product}'`) || registry.includes(`${product}:`), `product registry must include ${product}`)
}
assert(persistence.includes('edusim.${productId}.'), 'shared persistence must namespace values by product')
assert(eduvent.includes("createSimulationPersistence('eduvent')"), 'EDUVENT must use shared persistence')
assert(edumon.includes('createSimulationPersistence(productId)'), 'EDUMON must use shared persistence')

if (!process.exitCode) console.log('EDUSIM core regression checks passed')
