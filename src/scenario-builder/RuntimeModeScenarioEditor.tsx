import { useMemo, useRef, useState } from 'react'
import {
  LOPPJUSIM_RUNTIME_MODES,
  LOPPJUSIM_RUNTIME_MODE_CONTRACTS,
  normalizeSupportedRuntimeModes,
  type LoppjuSimRuntimeMode,
} from '../core/runtimeModes'
import type { ProductScenarioRow } from '../teaching/scenario/productLibrary'
import type { SharedScenarioEditorAdapter } from '../teaching/scenario/authoringTypes'
import { SharedScenarioEditorFramework } from './SharedScenarioEditorFramework'

interface RuntimeModeScenarioEditorProps<TScenario, TSnapshot> {
  adapter: SharedScenarioEditorAdapter<TScenario, TSnapshot>
  enabled?: boolean
  onStartScenario?: (row: ProductScenarioRow<TScenario>) => void
}

function sameModes(a: readonly LoppjuSimRuntimeMode[], b: readonly LoppjuSimRuntimeMode[]) {
  return a.length === b.length && a.every((mode, index) => mode === b[index])
}

/**
 * Studio wrapper that keeps runtime-mode compatibility product-neutral. The
 * product adapters only need to round-trip `supportedModes` in their stored
 * scenario format.
 */
export function RuntimeModeScenarioEditor<TScenario, TSnapshot>({
  adapter,
  enabled = true,
  onStartScenario,
}: RuntimeModeScenarioEditorProps<TScenario, TSnapshot>) {
  const modesRef = useRef<LoppjuSimRuntimeMode[]>([...LOPPJUSIM_RUNTIME_MODES])
  const [supportedModes, setSupportedModes] = useState<LoppjuSimRuntimeMode[]>([...LOPPJUSIM_RUNTIME_MODES])

  const runtimeAwareAdapter = useMemo<SharedScenarioEditorAdapter<TScenario, TSnapshot>>(() => ({
    ...adapter,
    toDocument: (name, scenario) => {
      const document = adapter.toDocument(name, scenario)
      const modes = normalizeSupportedRuntimeModes(document.supportedModes)
      modesRef.current = modes
      setSupportedModes((current) => sameModes(current, modes) ? current : [...modes])
      // Keep the document's array tied to the mutable mode reference so export
      // of an opened scenario sees mode changes made in this wrapper.
      return { ...document, supportedModes: modesRef.current }
    },
    fromDocument: (document) => adapter.fromDocument({
      ...document,
      supportedModes: [...modesRef.current],
    }),
  }), [adapter])

  const toggleMode = (mode: LoppjuSimRuntimeMode, checked: boolean) => {
    const current = modesRef.current
    const next = checked
      ? LOPPJUSIM_RUNTIME_MODES.filter((candidate) => candidate === mode || current.includes(candidate))
      : current.filter((candidate) => candidate !== mode)
    if (!next.length) return
    // Preserve the existing array reference when possible so an opened
    // SharedScenarioAuthoringDocument observes the update for JSON export.
    current.splice(0, current.length, ...next)
    setSupportedModes([...next])
  }

  return <>
    <section className="shared-scenario-content-card shared-scenario-runtime-modes" aria-label="Scenario runtime modes">
      <div>
        <span>Scenario availability</span>
        <h3>Runtime modes</h3>
        <p>Choose how this scenario may be used. Legacy scenarios without this setting remain available in all modes.</p>
      </div>
      <div className="shared-scenario-meta-grid">
        {LOPPJUSIM_RUNTIME_MODES.map((mode) => {
          const contract = LOPPJUSIM_RUNTIME_MODE_CONTRACTS[mode]
          const checked = supportedModes.includes(mode)
          return <label key={mode}>
            <span>{contract.label}</span>
            <span><input type="checkbox" checked={checked} onChange={(event) => toggleMode(mode, event.target.checked)} /> {contract.description}</span>
          </label>
        })}
      </div>
    </section>
    <SharedScenarioEditorFramework adapter={runtimeAwareAdapter} enabled={enabled} onStartScenario={onStartScenario} />
  </>
}
