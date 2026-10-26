import { useEffect, useMemo, useState } from 'react'
import type { ScenarioVariableDefinition } from './model'
import type { ScenarioProductId } from '../teaching/scenario/products'
import { VENTILATOR_SCENARIO_MODULE } from './modules/ventilator/definition'
import { EDUMON_PATIENT_GROUP_ORDER, getEdumonScenarioModule } from './modules/edumon/definition'
import { builtinProfilesForProduct } from '../profiles/builtinProfiles'
import {
  createProductProfile,
  deleteProductProfile,
  resetBuiltinProfile,
  saveBuiltinProfileOverride,
  updateProductProfile,
  type ProductProfileRow,
  type ProductProfileScope,
} from '../profiles/ProfileRepository'
import { useProductProfiles } from '../profiles/useProductProfiles'
import { useOrganisations } from '../organisations/useOrganisations'

interface ProfileItem {
  key: string
  name: string
  values: Record<string, unknown>
  builtin: boolean
  overridden: boolean
  row: ProductProfileRow<Record<string, unknown>> | null
}

type LibraryScope = 'organisation' | 'user'

function clinicalGroupClass(product: ScenarioProductId, group: string) {
  if (product !== 'anaesth' && product !== 'icu') return 'patient'
  if (group === 'Patient') return 'patient'
  if (group === 'Cardiovascular') return 'cardiovascular'
  if (group === 'Respiratory') return 'respiratory'
  if (group === 'Metabolism') return 'metabolism'
  if (group === 'Anaesthesia') return 'anaesthesia'
  return 'monitor'
}

function profileGroupOrder(product: ScenarioProductId, variables: Array<{ variable: ScenarioVariableDefinition }>) {
  const present = new Set(variables.map(({ variable }) => variable.group))
  if (product === 'anaesth' || product === 'icu') {
    return EDUMON_PATIENT_GROUP_ORDER.filter((group) => present.has(group))
  }
  return [...present]
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

function readValue(values: Record<string, unknown>, path: string): unknown {
  let current: unknown = values
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function writeValue(values: Record<string, unknown>, path: string, value: unknown) {
  const clone = structuredClone(values)
  const parts = path.split('.')
  let current = clone
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    const next = current[part]
    current[part] = next && typeof next === 'object' ? structuredClone(next) : {}
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
  return clone
}

function deepMerge(...sources: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const source of sources) {
    if (!source) continue
    for (const [key, value] of Object.entries(source)) {
      const previous = result[key]
      result[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? deepMerge(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous as Record<string, unknown> : undefined, value as Record<string, unknown>)
        : value
    }
  }
  return result
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
  const { memberships, active, loading: organisationsLoading, setActiveOrganisation } = useOrganisations()
  const [scope, setScope] = useState<LibraryScope>('organisation')
  const builtins = useMemo(() => builtinProfilesForProduct(product), [product])
  const variables = useMemo(() => profileVariables(product), [product])
  const groups = useMemo(() => profileGroupOrder(product, variables), [product, variables])
  const canManageOrganisation = active?.membership.role === 'owner' || active?.membership.role === 'admin'

  useEffect(() => {
    if (!organisationsLoading && !active && scope === 'organisation') setScope('user')
  }, [organisationsLoading, active?.organisation.id, scope])

  const requestedScope = useMemo<ProductProfileScope>(() => (
    scope === 'organisation' && active
      ? { type: 'organisation', organisationId: active.organisation.id }
      : { type: 'user' }
  ), [scope, active?.organisation.id])

  const organisationRows = useMemo(() => rows.filter((row) => row.owner_type === 'organisation' && row.organisation_id === active?.organisation.id), [rows, active?.organisation.id])
  const userRows = useMemo(() => rows.filter((row) => row.owner_type === 'user'), [rows])

  const items = useMemo<ProfileItem[]>(() => {
    const builtinItems = builtins.map((builtin) => {
      const organisationOverride = organisationRows.find((row) => row.base_key === builtin.key) ?? null
      const userOverride = userRows.find((row) => row.base_key === builtin.key) ?? null
      const override = scope === 'organisation' ? organisationOverride : userOverride
      return {
        key: builtin.key,
        name: builtin.name,
        values: scope === 'organisation'
          ? deepMerge(builtin.values, organisationOverride?.values)
          : deepMerge(builtin.values, organisationOverride?.values, userOverride?.values),
        builtin: true,
        overridden: Boolean(override),
        row: override,
      }
    })
    const scopedRows = scope === 'organisation' ? organisationRows : userRows
    const customItems = scopedRows.filter((row) => !row.base_key).map((row) => ({
      key: row.id,
      name: row.name,
      values: row.values,
      builtin: false,
      overridden: false,
      row,
    }))
    return [...builtinItems, ...customItems]
  }, [builtins, organisationRows, userRows, scope])

  const [selectedKey, setSelectedKey] = useState('')
  const selected = items.find((item) => item.key === selectedKey) ?? items[0] ?? null
  const [draftName, setDraftName] = useState('')
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [localMessage, setLocalMessage] = useState<string | null>(null)
  const libraryWritable = scope === 'user' || canManageOrganisation

  useEffect(() => {
    setSelectedKey('')
  }, [scope, product, active?.organisation.id])

  useEffect(() => {
    if (!selected) return
    if (!selectedKey) setSelectedKey(selected.key)
    setDraftName(selected.name)
    setDraftValues(structuredClone(selected.values))
    setLocalMessage(null)
  }, [selected?.key, selected?.row?.updated_at, product, scope, active?.organisation.id])

  const updateValue = (key: string, value: unknown) => setDraftValues((current) => writeValue(current, key, value))

  const save = async () => {
    if (!selected || !libraryWritable) return
    setBusy(true)
    setLocalMessage(null)
    try {
      if (selected.builtin) {
        await saveBuiltinProfileOverride(product, selected.key, selected.name, draftValues, requestedScope)
        setLocalMessage(scope === 'organisation' ? 'Organisation patient override saved.' : 'Personal patient override saved.')
      } else if (selected.row) {
        await updateProductProfile(selected.row.id, product, { name: draftName, values: draftValues })
        setLocalMessage(scope === 'organisation' ? 'Organisation patient saved.' : 'Personal patient saved.')
      }
      await refresh()
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to save patient preset.')
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async () => {
    if (!selected) return
    setBusy(true)
    setLocalMessage(null)
    try {
      const destinationScope: ProductProfileScope = scope === 'organisation' && canManageOrganisation && active
        ? { type: 'organisation', organisationId: active.organisation.id }
        : { type: 'user' }
      const created = await createProductProfile(product, `${selected.name} copy`, draftValues, null, destinationScope)
      if (destinationScope.type === 'user' && scope !== 'user') setScope('user')
      await refresh()
      setSelectedKey(created.id)
      setLocalMessage(destinationScope.type === 'organisation' ? 'Patient duplicated into the organisation library.' : 'Patient duplicated into My patients.')
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to duplicate patient preset.')
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!selected?.builtin || !libraryWritable) return
    setBusy(true)
    try {
      await resetBuiltinProfile(product, selected.key, requestedScope)
      await refresh()
      setLocalMessage(scope === 'organisation' ? 'Organisation override removed; built-in restored.' : 'Personal override removed.')
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to restore patient preset.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!selected?.row || selected.builtin || !libraryWritable) return
    setBusy(true)
    try {
      await deleteProductProfile(selected.row.id, product)
      setSelectedKey('')
      await refresh()
      setLocalMessage('Patient preset deleted.')
    } catch (cause) {
      setLocalMessage(cause instanceof Error ? cause.message : 'Unable to delete patient preset.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !items.length) return <section className="scenario-builder-state">Loading patients…</section>

  return (
    <section className="studio-profile-workspace">
      <div className="studio-profile-scopebar">
        <div className="studio-profile-scope-tabs">
          <button type="button" className={scope === 'organisation' ? 'selected' : ''} disabled={!active} onClick={() => setScope('organisation')}>Organisation</button>
          <button type="button" className={scope === 'user' ? 'selected' : ''} onClick={() => setScope('user')}>My patients</button>
        </div>
        {active && <label><span>Active organisation</span><select value={active.organisation.id} onChange={(event) => setActiveOrganisation(event.target.value)}>{memberships.map(({ organisation, membership }) => <option key={organisation.id} value={organisation.id}>{organisation.name} · {membership.role}</option>)}</select></label>}
        <p>{scope === 'organisation'
          ? active
            ? `${active.organisation.name} shared patient library · ${canManageOrganisation ? 'you can edit this library' : 'read-only for Instructor role'}`
            : 'Create or join an organisation to use a shared patient library.'
          : 'Personal patients are private to your instructor account and override organisation defaults when both exist.'}</p>
      </div>

      <section className="studio-profile-editor">
        <aside className="studio-profile-list">
          <div className="studio-profile-list-heading"><div><span>{scope === 'organisation' ? 'Organisation patients' : 'My patients'}</span><strong>{product === 'mv' ? 'LoppjuSIM-MV' : product === 'anaesth' ? 'LoppjuSIM-Anaesth' : 'LoppjuSIM-ICU'}</strong></div></div>
          {items.map((item) => <button type="button" key={item.key} className={selected?.key === item.key ? 'selected' : ''} onClick={() => setSelectedKey(item.key)}>
            <span>{item.name}</span><small>{item.builtin ? (item.overridden ? 'Built-in · modified' : 'Built-in') : scope === 'organisation' ? 'Organisation' : 'Personal'}</small>
          </button>)}
        </aside>

        {selected ? <div className="studio-profile-detail">
          <header>
            <div><span>{selected.builtin ? 'Built-in patient' : scope === 'organisation' ? 'Organisation patient' : 'Personal patient'}</span><h2>{selected.name}</h2><p>Patient presets are reusable baseline patient states. Organisation patients are shared with all members; scenarios remain separate and can override individual parameters per stage.</p></div>
            <div className="studio-profile-actions">
              <button type="button" onClick={() => void duplicate()} disabled={busy}>{scope === 'organisation' && !canManageOrganisation ? 'Copy to My patients' : 'Duplicate'}</button>
              {selected.builtin && selected.overridden && libraryWritable && <button type="button" onClick={() => void reset()} disabled={busy}>Restore inherited</button>}
              {!selected.builtin && libraryWritable && <button type="button" className="studio-profile-delete" onClick={() => void remove()} disabled={busy} aria-label="Delete patient" title="Delete patient">🗑</button>}
              {libraryWritable && <button type="button" className="scenario-builder-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save patient'}</button>}
            </div>
          </header>

          {!libraryWritable && <div className="studio-profile-readonly">Instructor role: organisation patients are read-only. You can copy a patient into My patients and edit your personal copy.</div>}
          {!selected.builtin && libraryWritable && <label className="studio-profile-name"><span>Patient name</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label>}

          <div className="studio-profile-groups">
            {groups.map((group) => <section key={group} className={`shared-scenario-control-group ${clinicalGroupClass(product, group)}`}>
              <h3>{group}</h3>
              <div className="shared-scenario-slider-grid">
                {variables.filter(({ variable }) => variable.group === group).map(({ variable, key }) => {
                  const value = readValue(draftValues, key)
                  const effectiveValue = value ?? variable.defaultValue ?? (variable.type === 'number' ? variable.min ?? 0 : undefined)
                  return <div key={variable.id} className={`shared-scenario-variable-row ${variable.type === 'number' ? 'slider' : ''}`}>
                    <div className="shared-scenario-variable-heading"><span className="shared-scenario-variable-label">{variable.label}</span><strong>{displayValue(variable, effectiveValue)}</strong></div>
                    {variable.type === 'number' && <input disabled={!libraryWritable} className="shared-scenario-control-slider" type="range" min={variable.min ?? 0} max={variable.max ?? 100} step={variable.step ?? 1} value={typeof effectiveValue === 'number' ? effectiveValue : Number(variable.defaultValue ?? variable.min ?? 0)} onChange={(event) => updateValue(key, Number(event.target.value))} />}
                    {variable.type === 'select' && <select disabled={!libraryWritable} value={String(effectiveValue ?? '')} onChange={(event) => updateValue(key, event.target.value)}>{variable.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
                    {variable.type === 'boolean' && <label className="shared-scenario-boolean-control"><input disabled={!libraryWritable} type="checkbox" checked={Boolean(effectiveValue)} onChange={(event) => updateValue(key, event.target.checked)} /><span>{effectiveValue ? 'Enabled' : 'Disabled'}</span></label>}
                  </div>
                })}
              </div>
            </section>)}
          </div>
          {(localMessage || message) && <div className="scenario-builder-message">{localMessage ?? message}</div>}
        </div> : <div className="scenario-builder-state">No patient presets available.</div>}
      </section>
    </section>
  )
}
