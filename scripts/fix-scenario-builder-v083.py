from pathlib import Path

p = Path('src/scenario-builder/SharedScenarioEditorFramework.tsx')
t = p.read_text()
t = t.replace("{choice === 'inherit' ? (transition.mode === 'linear' ? `${transition.durationSeconds}s` : 'Immediate') : 'Immediate'}", "{!override ? (transition.mode === 'linear' ? `${transition.durationSeconds}s` : 'Immediate') : 'Immediate'}")
p.write_text(t)

p = Path('src/scenario-builder/modules/ventilator/authoringAdapter.tsx')
t = p.read_text()
needle = "} from '../../../teaching/scenario/authoringTypes'\n\nfunction clone"
replacement = "} from '../../../teaching/scenario/authoringTypes'\nimport type { SharedScenarioTransition } from '../../../teaching/scenario/authoringTypes'\n\nfunction clone"
if 'import type { SharedScenarioTransition }' not in t:
    if needle not in t:
        raise SystemExit('authoringAdapter import insertion point missing')
    t = t.replace(needle, replacement)
p.write_text(t)
