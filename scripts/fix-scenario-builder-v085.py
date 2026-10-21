from pathlib import Path


def rep(path, old, new):
    p=Path(path); t=p.read_text()
    if old not in t: raise SystemExit(f'pattern not found {path}: {old[:120]!r}')
    p.write_text(t.replace(old,new))

# New media triggers must be narrowed before legacy actor/action formatting.
rep('src/components/DynamicScenarioBuilder.tsx',
"  if (type === 'question-correct') return { type: 'question-correct' }\n  if (type === 'patient-change')",
"  if (type === 'question-correct') return { type: 'question-correct' }\n  if (type === 'media-ended') return { type: 'media-ended' }\n  if (type === 'media-acknowledged') return { type: 'media-acknowledged' }\n  if (type === 'patient-change')")
rep('src/components/DynamicScenarioBuilder.tsx',
"  if (value.type === 'question-correct') return 'Correct answer submitted'\n  if (value.type === 'condition')",
"  if (value.type === 'question-correct') return 'Correct answer submitted'\n  if (value.type === 'media-ended') return 'Video finished'\n  if (value.type === 'media-acknowledged') return 'Media acknowledged'\n  if (value.type === 'condition')")

# Ref initializers must not read state variables before their declarations.
p=Path('src/edumon/EdumonApp.tsx'); t=p.read_text()
t=t.replace("  const simulationPausedRef = useRef(simulationPaused)\n  const simulationSpeedRef = useRef(simulationSpeed)\n  simulationPausedRef.current = simulationPaused\n  simulationSpeedRef.current = simulationSpeed\n", "  const simulationPausedRef = useRef(false)\n  const simulationSpeedRef = useRef<EdumonSimulationSpeed>(1)\n")
needle="  const [simulationSpeed, setSimulationSpeed] = useState<EdumonSimulationSpeed>(1)\n"
if needle not in t: raise SystemExit('simulation speed state not found')
t=t.replace(needle, needle+"  simulationPausedRef.current = simulationPaused\n  simulationSpeedRef.current = simulationSpeed\n")
p.write_text(t)
