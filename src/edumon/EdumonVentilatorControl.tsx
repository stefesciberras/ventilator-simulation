import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { VentilatorMode } from '../simulation/types'
import { resolvedMonitorRespiratorySettings } from './respiratoryPhysiology'
import type { MonitorPatientState } from './types'
import './edumon-ventilator.css'

type EdumonVentilatorMode = 'MANUAL' | Exclude<VentilatorMode, 'APRV' | 'BIPAP'>
type VentilatorSettingKey = 'rate' | 'tidalVolume' | 'peep' | 'fio2' | 'pressureControl' | 'pressureSupport' | 'inspiratoryTime' | 'pressureLimit'

type VentilatorState = {
  mode: EdumonVentilatorMode
  rate: number
  tidalVolume: number
  peep: number
  fio2: number
  pressureControl: number
  pressureSupport: number
  inspiratoryTime: number
  pressureLimit: number
}

type SettingDefinition = {
  key: VentilatorSettingKey
  label: string
  unit: string
  step: number
  min: number
  max: number
  decimals?: number
}

const MODES: Array<{ value: EdumonVentilatorMode; label: string }> = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'VC-AC', label: 'VC-AC' },
  { value: 'PC-AC', label: 'PC-AC' },
  { value: 'PSV', label: 'PSV' },
  { value: 'SIMV-VC', label: 'SIMV-VC' },
  { value: 'SIMV-PC', label: 'SIMV-PC' },
  { value: 'VG-PC', label: 'VG-PC' },
]

const SETTINGS: Record<VentilatorSettingKey, SettingDefinition> = {
  rate: { key: 'rate', label: 'RR', unit: '/min', step: 1, min: 4, max: 40 },
  tidalVolume: { key: 'tidalVolume', label: 'VT', unit: 'mL', step: 25, min: 100, max: 1000 },
  peep: { key: 'peep', label: 'PEEP', unit: 'cmH₂O', step: 1, min: 0, max: 20 },
  fio2: { key: 'fio2', label: 'FiO₂', unit: '%', step: 5, min: 21, max: 100 },
  pressureControl: { key: 'pressureControl', label: 'Pinsp', unit: 'cmH₂O', step: 1, min: 5, max: 35 },
  pressureSupport: { key: 'pressureSupport', label: 'PS', unit: 'cmH₂O', step: 1, min: 0, max: 30 },
  inspiratoryTime: { key: 'inspiratoryTime', label: 'Ti', unit: 's', step: 0.1, min: 0.4, max: 2.5, decimals: 1 },
  pressureLimit: { key: 'pressureLimit', label: 'Pmax', unit: 'cmH₂O', step: 1, min: 15, max: 50 },
}

const MODE_SETTINGS: Record<EdumonVentilatorMode, VentilatorSettingKey[]> = {
  MANUAL: ['rate', 'tidalVolume', 'peep', 'fio2'],
  'VC-AC': ['rate', 'tidalVolume', 'peep', 'fio2'],
  'PC-AC': ['rate', 'pressureControl', 'peep', 'inspiratoryTime', 'fio2'],
  PSV: ['pressureSupport', 'peep', 'fio2'],
  'SIMV-VC': ['rate', 'tidalVolume', 'pressureSupport', 'peep', 'fio2'],
  'SIMV-PC': ['rate', 'pressureControl', 'pressureSupport', 'peep', 'fio2'],
  'VG-PC': ['rate', 'tidalVolume', 'pressureLimit', 'peep', 'fio2'],
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function findVisibleFooterHost(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('.simulation-console-footer .edumon-control-strip'))
  return candidates.find((candidate) => candidate.isConnected && candidate.getClientRects().length > 0)
    ?? candidates.find((candidate) => candidate.isConnected)
    ?? null
}

export function EdumonVentilatorControl({ patientState }: { patientState: MonitorPatientState }) {
  const respiratory = resolvedMonitorRespiratorySettings(patientState)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [ventilator, setVentilator] = useState<VentilatorState>(() => ({
    mode: 'MANUAL',
    rate: Math.max(4, Math.round(respiratory.respiratoryRate || 12)),
    tidalVolume: Math.max(100, Math.round(respiratory.tidalVolumeMl || 500)),
    peep: Math.max(0, Math.round(respiratory.peepCmH2O || 5)),
    fio2: Math.max(21, Math.round((respiratory.fio2 || 0.21) * 100)),
    pressureControl: 15,
    pressureSupport: 10,
    inspiratoryTime: 1,
    pressureLimit: 40,
  }))

  useEffect(() => {
    const findHost = () => setHost((current) => {
      const next = findVisibleFooterHost()
      return current === next ? current : next
    })
    findHost()
    const observer = new MutationObserver(findHost)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', findHost)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', findHost)
    }
  }, [])

  useEffect(() => {
    if (!host) return
    host.classList.add('edumon-control-strip-with-ventilator')
    return () => host.classList.remove('edumon-control-strip-with-ventilator')
  }, [host])

  const adjust = (definition: SettingDefinition, direction: -1 | 1) => {
    setVentilator((current) => ({
      ...current,
      [definition.key]: clamp(current[definition.key] + definition.step * direction, definition.min, definition.max),
    }))
  }

  const monitoring = useMemo(() => {
    const compliance = Math.max(20, respiratory.complianceMlPerCmH2O)
    let tidalVolume = ventilator.tidalVolume
    let peakPressure = ventilator.peep + ventilator.tidalVolume / compliance + 4

    if (ventilator.mode === 'PC-AC' || ventilator.mode === 'SIMV-PC') {
      tidalVolume = clamp(ventilator.pressureControl * compliance * 0.7, 100, 1000)
      peakPressure = ventilator.peep + ventilator.pressureControl
    } else if (ventilator.mode === 'PSV') {
      tidalVolume = clamp(ventilator.pressureSupport * compliance * 0.7, 100, 1000)
      peakPressure = ventilator.peep + ventilator.pressureSupport
    } else if (ventilator.mode === 'VG-PC') {
      peakPressure = Math.min(ventilator.pressureLimit, ventilator.peep + ventilator.tidalVolume / compliance + 4)
    }

    const respiratoryRate = ventilator.rate
    return {
      respiratoryRate,
      tidalVolume: Math.round(tidalVolume),
      minuteVentilation: respiratoryRate * tidalVolume / 1000,
      peakPressure: Math.round(peakPressure),
    }
  }, [respiratory.complianceMlPerCmH2O, ventilator])

  if (!host) return null

  return createPortal(
    <section className="edumon-ventilator-row" aria-label="Ventilator settings and monitoring">
      <div className="edumon-ventilator-controls">
        <label className="edumon-ventilator-mode">
          <span>VENT MODE</span>
          <select
            value={ventilator.mode}
            onChange={(event) => setVentilator((current) => ({ ...current, mode: event.target.value as EdumonVentilatorMode }))}
          >
            {MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
        </label>

        <div className="edumon-ventilator-setting-list">
          {MODE_SETTINGS[ventilator.mode].map((key) => {
            const definition = SETTINGS[key]
            const value = ventilator[key]
            return (
              <div key={key} className="edumon-ventilator-setting" title={`${definition.label} ${value} ${definition.unit}`}>
                <span>{definition.label}</span>
                <div>
                  <button type="button" onClick={() => adjust(definition, -1)} aria-label={`Decrease ${definition.label}`}>−</button>
                  <strong>{value.toFixed(definition.decimals ?? 0)}</strong>
                  <button type="button" onClick={() => adjust(definition, 1)} aria-label={`Increase ${definition.label}`}>+</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="edumon-ventilator-monitor" aria-label="Ventilator monitored values">
        <div><span>Resp Rate</span><strong>{monitoring.respiratoryRate}</strong><small>/min</small></div>
        <div><span>TV</span><strong>{monitoring.tidalVolume}</strong><small>mL</small></div>
        <div><span>Min Vent</span><strong>{monitoring.minuteVentilation.toFixed(1)}</strong><small>L/min</small></div>
        <div><span>Peak Press</span><strong>{monitoring.peakPressure}</strong><small>cmH₂O</small></div>
      </div>
    </section>,
    host,
  )
}
