import { useEffect, useMemo, useState } from 'react'
import type { ScenarioVariableDefinition } from './model'
import type { ScenarioProductId } from '../teaching/scenario/products'
import { VENTILATOR_SCENARIO_MODULE } from './modules/ventilator/definition'
import { getEdumonScenarioModule } from './modules/edumon/definition'
import { builtinProfilesForProduct } from '../profiles/builtinProfiles'
import {
  createProductProfile,
  deleteProductProfile,
  resetBuiltinProfile,
  saveBuiltinProfileOverride,
  updateProductProfile,
  type ProductProfileRow,
} from '../profiles/ProfileRepository'
import { useProductProfiles } from '../profiles/useProductProfiles'

interface ProfileItem {
  key: string
  name: string
  values: Record<string, unknown>
  builtin: boolean
  overridden: boolean
  row: ProductProfileRow<Record<string, unknown>> | null
}

function profileVariables(product: ScenarioProductId): Array<{ variable: ScenarioVariableDefinition; key: string }> {
  if (product === 'mv') {
    return VENTILATOR_SCENARIO_MODULE.variables
      .filter((variable) => variable.role === 'setting' && variable.writable && variable.id.startsWith('patient.'))
      .map((variable) => ({ variable, key: variable.id.slice('patient.'.length) }))
  }
  const module = getEdumonScenarioModule(product)
  return module.variables
    .filter((variable) => variable.role === 'setting' && variable.writable && variable.snapshotPath?.startsWith('patient.'))
    .map((variable) => ({ variable, key: variable.snapshotPath!.slice('patient.'.length) }))
}

function decimalsFor(step?: number) {
  if (step == null || step >= 1) return 0
  return String(step).split('.')[1]?.length ?? 0
}

function displayValue(variable: ScenarioVariableDefinition, value: unknown) {
  if (variable.type === 'select') return variable.options?.find((option) => option.value === String(value))?.label ?? String(value ?? '')
  if (variable.type === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'number') return `${value.toFixed(decimalsFor(variable.step))}${variable.unit ? ` ${variable.unit}` : ''}`
  return String(value ?? '')
}

export function ProfileEditor({ product }: { product: ScenarioProductId }) {
  const { rows, loading, message, refresh } = useProductProfiles<Record<string, unknown>>(product)
  const builtins = useMemo(() => builtinProfilesForProduct(product), [product])
  const variables = useMemo(() => profileVariables(product), [product])
  const items = useMemo<ProfileItem[]>(() => {
    const builtinItems = builtins.map((builtin) => {
      const override = rows.find((row) => row.base_key === builtin.key) ?? null
      return {
        key: builtin.key,
        name: builtin.name,
        values: { ...builtin.values, ...(override?.values ?? {}) },
        builtin: true,
        overridden: Boolean(override),
        row: override,
      }
    })
    const customItems = rows.filter((row) => !row.base_key).map((row) => ({
      key: row.id,
      name: row.name,
      values: row.values,
      builtin: false,
      overridden: false,
      row,
    }))
    return [...builtinItems, ...customItems]
  }, [builtins, rows])

  const [selectedKey, setSelectedKey] = useState('')
  const selected = items.find((item) => item.key === selectedKey) ?? items[0] ?? null
  const [draftName, setDraftName] = useState('')
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [localMessage, setLocalMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!selected) return
    if (!selectedKey) setSelectedKey(selected.key)
    setDraftName(selected.name)
    setDraftValues(structuredClone(selected.values))
    setLocalMessage(null)
  }, [selected?.key, selected?.row?.updated_at, product])

  const updateValue = (key: string, value: unknown) => setDraftValues((current) => ({ ...current, [key]: value }))

  const save = async () => {
    if (!selected) return
    setBusy(true)
    setLocalMessage(null)
    try {
      if (selected.builtin) {
        await saveBuiltinProfileOverride(product, selected.key, selected.name, draftValues)
        setLocalMessage('Profile override saved. The simulator will use it when this instructor account is signed in.')
      } else if (selected.row) {
        await updateProductProfile(selected.row.id, product, { name: draftName, values: draftValues })
        setLocalMessage('Profile saved.')
      }
      await refresh()
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to save profile.')
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async () => {
    if (!selected) return
    setBusy(true)
    setLocalMessage(null)
    try {
      const created = await createProductProfile(product, `${selected.name} copy`, draftValues)
      await refresh()
      setSelectedKey(created.id)
      setLocalMessage('Profile duplicated.')
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to duplicate profile.')
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!selected?.builtin) return
    setBusy(true)
    try {
      await resetBuiltinProfile(product, selected.key)
      await refresh()
      setLocalMessage('Built-in profile restored.')
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to restore profile.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!selected?.row || selected.builtin) return
    setBusy(true)
    try {
      await deleteProductProfile(selected.row.id, product)
      setSelectedKey('')
      await refresh()
      setLocalMessage('Profile deleted.')
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to delete profile.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !items.length) return <section className="scenario-builder-state">Loading profiles…</section>

  return (
    <section className="studio-profile-editor">
      <aside className="studio-profile-list">
        <div className="studio-profile-list-heading"><div><span>Profile library</span><strong>{product === 'mv' ? 'LoppjuSIM-MV' : product === 'anaesth' ? 'LoppjuSIM-Anaesth' : 'LoppjuSIM-ICU'}</strong></div></div>
        {items.map((item) => <button type="button" key={item.key} className={selected?.key === item.key ? 'selected' : ''} onClick={() => setSelectedKey(item.key)}>
          <span>{item.name}</span><small>{item.builtin ? (item.overridden ? 'Built-in · modified' : 'Built-in') : 'Custom'}</small>
        </button>)}
      </aside>

      {selected ? <div className="studio-profile-detail">
        <header>
          <div><span>{selected.builtin ? 'Built-in profile' : 'Custom profile'}</span><h2>{selected.name}</h2><p>Profiles are reusable baseline patient states. Scenarios remain separate and can override individual parameters per stage.</p></div>
          <div className="studio-profile-actions">
            <button type="button" onClick={() => void duplicate()} disabled={busy}>Duplicate</button>
            {selected.builtin && selected.overridden && <button type="button" onClick={() => void reset()} disabled={busy}>Restore built-in</button>}
            {!selected.builtin && <button type="button" className="studio-profile-delete" onClick={() => void remove()} disabled={busy} aria-label="Delete profile" title="Delete profile">🗑</button>}
            <button type="button" className="scenario-builder-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </header>

        {!selected.builtin && <label className="studio-profile-name"><span>Profile name</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label>}

        <div className="studio-profile-groups">
          {[...new Set(variables.map(({ variable }) => variable.group))].map((group) => <section key={group} className="shared-scenario-control-group monitor">
            <h3>{group}</h3>
            <div className="shared-scenario-slider-grid">
              {variables.filter(({ variable }) => variable.group === group).map(({ variable, key }) => {
                const value = draftValues[key]
                return <div key={variable.id} className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''}`}>
                  <div className="shared-scenario-variable-heading"><span className="shared-scenario-variable-label">{variable.label}</span><strong>{displayValue(variable, value)}</strong></div>
                  {variable.type === 'number' && <input className="shared-scenario-control-slider" type="range" min={variable.min ?? 0} max={variable.max ?? 100} step={variable.step ?? 1} value={typeof value === 'number' ? value : Number(variable.defaultValue ?? variable.min ?? 0)} onChange={(event) => updateValue(key, Number(event.target.value))} />}
                  {variable.type === 'select' && <select value={String(value ?? variable.defaultValue ?? '')} onChange={(event) => updateValue(key, event.target.value)}>{variable.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
                  {variable.type === 'boolean' && <label className="shared-scenario-boolean-control"><input type="checkbox" checked={Boolean(value)} onChange={(event) => updateValue(key, event.target.checked)} /><span>{value ? 'Enabled' : 'Disabled'}</span></label>}
                </div>
              })}
            </div>
          </section>)}
        </div>
        {(localMessage || message) && <div className="scenario-builder-message">{localMessage ?? message}</div>}
      </div> : <div className="scenario-builder-state">No profiles available.</div>}
    </section>
  )
}
