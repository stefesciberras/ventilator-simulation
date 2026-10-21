from pathlib import Path

for path, old, new in [
    ('src/instructorAccount.ts', '  trigger?: DynamicScenarioTrigger\n', '  trigger: DynamicScenarioTrigger\n'),
    ('src/teaching/scenario/runtimeCore.ts', '  trigger?: TTrigger\n', '  trigger: TTrigger\n'),
]:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'missing compatibility anchor in {path}')
    p.write_text(s.replace(old, new, 1))
