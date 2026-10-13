from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

replace_once(
    'src/instructorAccount.ts',
    "  description?: string\n  ventilator: VentilatorSettings",
    "  description?: string\n  mediaIds?: string[]\n  ventilator: VentilatorSettings",
)
replace_once(
    'src/instructorAccount.ts',
    "    schemaVersion: 1,\n    kind: 'static',\n    description: description.trim(),",
    "    schemaVersion: 2,\n    kind: 'static',\n    description: description.trim(),\n    mediaIds: [...new Set((scenario.mediaIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))],",
)
replace_once(
    'src/instructorAccount.ts',
    "    description: scenario.description ?? '',\n  }",
    "    description: scenario.description ?? '',\n    mediaIds: [...new Set((scenario.mediaIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))],\n  }",
)

replace_once(
    'src/App.tsx',
    "import { InstructorAccountControls } from './components/InstructorAccountControls'\n",
    "import { InstructorAccountControls } from './components/InstructorAccountControls'\nimport { CaseMediaPanel } from './components/CaseMediaPanel'\n",
)
replace_once(
    'src/App.tsx',
    "const SHOW_PATIENT_EFFORT_STORAGE_KEY = 'eduvent.show-patient-effort'\n",
    "const SHOW_PATIENT_EFFORT_STORAGE_KEY = 'eduvent.show-patient-effort'\nconst SCENARIO_MEDIA_STORAGE_KEY = 'eduvent.scenario-media-ids'\n",
)
replace_once(
    'src/App.tsx',
    "  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)\n",
    "  const [scenarioMediaIds, setScenarioMediaIds] = useState<string[]>(() => {\n    if (typeof window === 'undefined') return []\n    try {\n      const parsed = JSON.parse(window.localStorage.getItem(SCENARIO_MEDIA_STORAGE_KEY) ?? '[]')\n      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0) : []\n    } catch {\n      return []\n    }\n  })\n  const [alarmDialogOpen, setAlarmDialogOpen] = useState(false)\n",
)
replace_once(
    'src/App.tsx',
    "    waveformDisplay,\n  }\n\n  const loadInstructorScenario",
    "    waveformDisplay,\n    mediaIds: scenarioMediaIds,\n  }\n\n  const loadInstructorScenario",
)
replace_once(
    'src/App.tsx',
    "    setWaveformDisplay({ ...scenario.waveformDisplay })\n  }",
    "    setWaveformDisplay({ ...scenario.waveformDisplay })\n    setScenarioMediaIds([...(scenario.mediaIds ?? [])])\n  }",
)
replace_once(
    'src/App.tsx',
    "  useEffect(() => {\n    window.localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(waveformDisplay))\n  }, [waveformDisplay])\n",
    "  useEffect(() => {\n    window.localStorage.setItem(WAVEFORM_STORAGE_KEY, JSON.stringify(waveformDisplay))\n  }, [waveformDisplay])\n\n  useEffect(() => {\n    window.localStorage.setItem(SCENARIO_MEDIA_STORAGE_KEY, JSON.stringify(scenarioMediaIds))\n  }, [scenarioMediaIds])\n",
)
replace_once(
    'src/App.tsx',
    "          <InstructorAccountControls\n            role={teachingSession.role}\n            currentScenario={currentInstructorScenario}\n            onLoadScenario={loadInstructorScenario}\n          />\n",
    "          <InstructorAccountControls\n            role={teachingSession.role}\n            currentScenario={currentInstructorScenario}\n            onLoadScenario={loadInstructorScenario}\n          />\n          <CaseMediaPanel\n            role={teachingSession.role}\n            sessionId={teachingSession.session?.id ?? null}\n            scenarioMediaIds={scenarioMediaIds}\n            onScenarioMediaIdsChange={setScenarioMediaIds}\n          />\n",
)

replace_once(
    'src/components/InstructorAccountControls.tsx',
    "    `Shunt ${Math.round((patient.shuntFraction ?? 0.03) * 100)}%`,\n  ]",
    "    `Shunt ${Math.round((patient.shuntFraction ?? 0.03) * 100)}%`,\n    `Media ${scenario.mediaIds?.length ?? 0}`,\n  ]",
)
replace_once(
    'src/components/SessionPanel.tsx',
    "    `Shunt ${Math.round((scenario.patient.shuntFraction ?? 0.03) * 100)}%`,\n  ]",
    "    `Shunt ${Math.round((scenario.patient.shuntFraction ?? 0.03) * 100)}%`,\n    `Media ${scenario.mediaIds?.length ?? 0}`,\n  ]",
)

for file_name in ['src/App.tsx', 'src/components/SessionPanel.tsx', 'src/components/InstructorAccountControls.tsx']:
    p = Path(file_name)
    text = p.read_text()
    text = text.replace("'0.63'", "'0.64'").replace("'v0.63'", "'v0.64'").replace('>v0.63<', '>v0.64<')
    p.write_text(text)
