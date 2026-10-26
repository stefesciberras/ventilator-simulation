from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'Expected text not found in {path}: {old[:100]!r}')
    p.write_text(s.replace(old, new, count))

# Scenario Studio should open on the product requested by ?product=mv|anaesth|icu
# while preserving the existing internal module id `ventilator` for MV.
path = 'src/scenario-builder/ScenarioBuilderApp.tsx'
replace(
    path,
    "type StudioResource = 'scenarios' | 'profiles' | 'organisation'\n",
    "type StudioResource = 'scenarios' | 'profiles' | 'organisation'\n\nfunction moduleIdFromProduct(product: string | null) {\n  if (product === 'anaesth') return 'anaesth'\n  if (product === 'icu') return 'icu'\n  if (product === 'mv') return 'ventilator'\n  return DEFAULT_SCENARIO_MODULE_ID\n}\n\nfunction productFromModuleId(moduleId: string): ScenarioProductId {\n  if (moduleId === 'anaesth') return 'anaesth'\n  if (moduleId === 'icu') return 'icu'\n  return 'mv'\n}\n",
)
replace(
    path,
    "  const [moduleId, setModuleId] = useState(DEFAULT_SCENARIO_MODULE_ID)\n",
    "  const [moduleId, setModuleId] = useState(() => moduleIdFromProduct(new URLSearchParams(window.location.search).get('product')))\n",
)
replace(
    path,
    "  const closeBuilder = () => {\n    if (launchingScenarioRef.current) return\n    window.location.assign('/')\n  }\n",
    "  const selectModule = (nextModuleId: string) => {\n    setModuleId(nextModuleId)\n    const url = new URL(window.location.href)\n    url.searchParams.set('product', productFromModuleId(nextModuleId))\n    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)\n  }\n\n  const closeBuilder = () => {\n    if (launchingScenarioRef.current) return\n    window.location.assign('/')\n  }\n",
)
replace(
    path,
    '<select value={moduleId} onChange={(event) => setModuleId(event.target.value)}>',
    '<select value={moduleId} onChange={(event) => selectModule(event.target.value)}>',
)

# Product menu: deep-link Studio to the simulator from which it was opened.
path = 'src/components/LoppjuSimPlatformMenu.tsx'
replace(
    path,
    "const modeLabel = (role: LoppjuSimRunMode) => role === 'standalone' ? 'Standalone' : role === 'instructor' ? 'Instructor session' : 'Candidate session'\n",
    "const modeLabel = (role: LoppjuSimRunMode) => role === 'standalone' ? 'Standalone' : role === 'instructor' ? 'Instructor session' : 'Candidate session'\n\nfunction scenarioProductForLabel(productLabel: string) {\n  if (productLabel === 'LoppjuSIM-Anaesth') return 'anaesth'\n  if (productLabel === 'LoppjuSIM-ICU') return 'icu'\n  return 'mv'\n}\n",
)
replace(
    path,
    "  const platformUnlocked = authenticated && effectiveRole === 'standalone'\n",
    "  const platformUnlocked = authenticated && effectiveRole === 'standalone'\n  const scenarioProduct = scenarioProductForLabel(productLabel)\n",
)
replace(
    path,
    "onClick={() => navigate('/scenarios')}",
    "onClick={() => navigate(`/scenarios?product=${scenarioProduct}`)}",
)

# Rebranded module selector label/copy.
path = 'src/scenario-builder/modules/ventilator/definition.ts'
replace(path, "  label: 'Mechanical ventilation',", "  label: 'LoppjuSIM-MV',")
replace(path, "  shortLabel: 'Ventilator',", "  shortLabel: 'LoppjuSIM-MV',")
replace(path, "  description: 'EDUVENT patient, ventilator and physiology scenarios.',", "  description: 'LoppjuSIM-MV patient, ventilator and respiratory physiology scenarios.',")

# Remove the old EDUMON two-column heading override: Anaesth/ICU should use exactly
# the same Apply + label + value heading geometry as LoppjuSIM-MV.
path = 'src/scenario-builder/scenarioBuilder.css'
replace(path, '/* EDUMON-Ana / EDUMON-ICU current slider presentation */', '/* LoppjuSIM-Anaesth / LoppjuSIM-ICU slider presentation */')
replace(
    path,
    '.shared-scenario-edumon-snapshot .shared-scenario-variable-heading{grid-template-columns:minmax(0,1fr) auto}',
    '.shared-scenario-edumon-snapshot .shared-scenario-variable-heading{grid-template-columns:auto minmax(0,1fr) auto}',
)

# Keep shared scenario-manager copy on the public LoppjuSIM branding.
path = 'src/teaching/instructor/InstructorScenarioLibraryController.tsx'
replace(path, 'Use the shared EDUSIM Scenario Builder', 'Use LoppjuSIM-Studio')
replace(path, 'product-aware Scenario Builder.', 'product-aware LoppjuSIM-Studio workspace.')
replace(path, '>Open Scenario Builder</a>', '>Open LoppjuSIM-Studio</a>')

# Studio version bump.
replace('src/scenario-builder/version.ts', "SCENARIO_BUILDER_VERSION = '0.11.3'", "SCENARIO_BUILDER_VERSION = '0.11.4'")
