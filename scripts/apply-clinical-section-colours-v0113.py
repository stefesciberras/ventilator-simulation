from pathlib import Path

# Registry label/order: Patient rather than Patient characteristics.
p = Path('src/scenario-builder/modules/edumon/definition.ts')
s = p.read_text()
s = s.replace("group: 'Patient characteristics'", "group: 'Patient'")
s = s.replace("EDUMON_PATIENT_GROUP_ORDER = ['Patient characteristics', 'Cardiovascular', 'Respiratory', 'Metabolism', 'Anaesthesia']", "EDUMON_PATIENT_GROUP_ORDER = ['Patient', 'Cardiovascular', 'Respiratory', 'Metabolism', 'Anaesthesia']")
p.write_text(s)

# Shared helper for clinical CSS class names in both Patient and scenario-stage editors.
for path in ['src/scenario-builder/modules/edumon/authoringAdapter.tsx', 'src/scenario-builder/ProfileEditor.tsx']:
    p = Path(path)
    s = p.read_text()
    if path.endswith('authoringAdapter.tsx'):
        anchor = "type EdumonScenarioProduct = Extract<ScenarioProductId, 'anaesth' | 'icu'>\n"
        helper = anchor + "\nfunction clinicalGroupClass(group: string) {\n  if (group === 'Patient') return 'patient'\n  if (group === 'Cardiovascular') return 'cardiovascular'\n  if (group === 'Respiratory') return 'respiratory'\n  if (group === 'Metabolism') return 'metabolism'\n  if (group === 'Anaesthesia') return 'anaesthesia'\n  return 'monitor'\n}\n"
        if anchor not in s: raise SystemExit('authoring helper anchor missing')
        s = s.replace(anchor, helper, 1)
        s = s.replace('className="shared-scenario-control-group monitor"', 'className={`shared-scenario-control-group ${clinicalGroupClass(group)}`}')
    else:
        anchor = "type LibraryScope = 'organisation' | 'user'\n"
        helper = anchor + "\nfunction clinicalGroupClass(product: ScenarioProductId, group: string) {\n  if (product !== 'anaesth' && product !== 'icu') return 'patient'\n  if (group === 'Patient') return 'patient'\n  if (group === 'Cardiovascular') return 'cardiovascular'\n  if (group === 'Respiratory') return 'respiratory'\n  if (group === 'Metabolism') return 'metabolism'\n  if (group === 'Anaesthesia') return 'anaesthesia'\n  return 'monitor'\n}\n"
        if anchor not in s: raise SystemExit('profile helper anchor missing')
        s = s.replace(anchor, helper, 1)
        s = s.replace('className="shared-scenario-control-group monitor"', 'className={`shared-scenario-control-group ${clinicalGroupClass(product, group)}`}')
    p.write_text(s)

# Import clinical colour overrides after the base Scenario Builder CSS.
p = Path('src/scenario-builder/ScenarioBuilderApp.tsx')
s = p.read_text()
s = s.replace("import './scenarioBuilder.css'", "import './scenarioBuilder.css'\nimport './clinicalSections.css'")
p.write_text(s)

# Version bump.
p = Path('src/scenario-builder/version.ts')
s = p.read_text().replace("SCENARIO_BUILDER_VERSION = '0.11.2'", "SCENARIO_BUILDER_VERSION = '0.11.3'")
p.write_text(s)
