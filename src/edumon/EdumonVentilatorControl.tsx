import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { VentilatorMode } from '../simulation/types'
import { InteractiveSettingControls, type InteractiveSettingSpec } from '../components/InteractiveSettingControls'
import { resolvedMonitorRespiratorySettings } from './respiratoryPhysiology'
import type { MonitorPatientState, MonitorRespiratorySettings } from './types'
import './edumon-ventilator.css'

type EdumonVentilatorMode = 'MANUAL' | Exclude<VentilatorMode, 'APRV' | 'BIPAP'>
type VentilatorSettingKey =
  | 'fio2'
  | 'peep'
  | 'rate'
  | 'ieRatio'
  | 'tidalVolume'
  | 'inspiratoryFlow'
  | 'plateauPercent'
  | 'pressureControl'
  | 'volumeGuaranteePressureLimit'
  | 'pressureSupport'
  | 'terminationSensitivity'
  | 'simvSyncWindowPercent'

type VentilatorState = {
  mode: EdumonVentilatorMode
  rate: number
  tidalVolume: number
  peep: number
  fio2: number
  inspiratoryTime: number
  inspiratoryFlow: number
  plateauPercent: number
  pressureControl: number
  volumeGuaranteePressureLimit: number
  pressureSupport: number
  terminationSensitivity: number
  simvSyncWindowPercent: number
}

type EffectiveVentilation = {
  respiratoryRate: number
  tidalVolumeMl: number
  minuteVentilationLMin: number
  peakPressureCmH2O: number
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

const MIN_IE = 0.5
const MAX_IE = 8
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const cycleTime = (rate: number) => 60 / Math.max(rate, 1)
const isVolumeMandatoryMode = (mode: EdumonVentilatorMode) => mode === 'VC-AC' || mode === 'SIMV-VC'
const isPressureMandatoryMode = (mode: EdumonVentilatorMode) => mode === 'PC-AC' || mode === 'SIMV-PC'
const isSimvMode = (mode: EdumonVentilatorMode) => mode === 'SIMV-VC' || mode === 'SIMV-PC'
const usesTidalVolume = (mode: EdumonVentilatorMode) => isVolumeMandatoryMode(mode) || mode === 'VG-PC'
const hasConventionalMandatoryTiming = (mode: EdumonVentilatorMode) => mode !== 'MANUAL' && mode !== 'PSV'
const ieRatioFrom = (state: VentilatorState) => clamp(cycleTime(state.rate) / Math.max(state.inspiratoryTime, 0.2) - 1, MIN_IE, MAX_IE)

function findVisibleFooterHost(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('.simulation-console-footer .edumon-control-strip'))
  return candidates.find((candidate) => candidate.isConnected && candidate.getClientRects().length > 0)
    ?? candidates.find((candidate) => candidate.isConnected)
    ?? null
}

function deriveEffectiveVentilation(ventilator: VentilatorState, respiratory: MonitorRespiratorySettings): EffectiveVentilation {
  const compliance = Math.max(20, respiratory.complianceMlPerCmH2O)
  const spontaneousRate = clamp(respiratory.spontaneousRespiratoryRate, 0, 40)
  const spontaneousTidalVolume = clamp(respiratory.spontaneousTidalVolumeMl, 0, 1000)

  let respiratoryRate = spontaneousRate
  let tidalVolumeMl = spontaneousTidalVolume
  let peakPressureCmH2O = ventilator.peep + spontaneousTidalVolume / compliance + 4

  if (ventilator.mode === 'PSV') {
    tidalVolumeMl = clamp(ventilator.pressureSupport * compliance * 0.7, 100, 1000)
    peakPressureCmH2O = ventilator.peep + ventilator.pressureSupport
  } else if (ventilator.mode !== 'MANUAL') {
    respiratoryRate = Math.max(ventilator.rate, spontaneousRate)

    if (ventilator.mode === 'PC-AC' || ventilator.mode === 'SIMV-PC') {
      tidalVolumeMl = clamp(ventilator.pressureControl * compliance * 0.7, 100, 1000)
      peakPressureCmH2O = ventilator.peep + ventilator.pressureControl
    } else {
      tidalVolumeMl = ventilator.tidalVolume
      peakPressureCmH2O = ventilator.peep + ventilator.tidalVolume / compliance + 4
      if (ventilator.mode === 'VG-PC') {
        peakPressureCmH2O = Math.min(ventilator.volumeGuaranteePressureLimit, peakPressureCmH2O)
      }
    }
  }

  return {
    respiratoryRate,
    tidalVolumeMl,
    minuteVentilationLMin: respiratoryRate * tidalVolumeMl / 1000,
    peakPressureCmH2O,
  }
}

interface EdumonVentilatorControlProps {
  patientState: MonitorPatientState
  onPatientStateChange: (state: MonitorPatientState) => void
  disabled?: boolean
}

export function EdumonVentilatorControl({ patientState, onPatientStateChange, disabled = false }: EdumonVentilatorControlProps) {
  const respiratory = resolvedMonitorRespiratorySettings(patientState)
  const patientRef = useRef(patientState)
  patientRef.current = patientState

  const [host, setHost] = useState<HTMLElement | null>(null)
  const [ventilator, setVentilator] = useState<VentilatorState>(() => ({
    mode: 'MANUAL',
    rate: Math.max(5, Math.round(respiratory.respiratoryRate || 12)),
    tidalVolume: Math.max(250, Math.round(respiratory.tidalVolumeMl || 500)),
    peep: Math.max(0, Math.round(respiratory.peepCmH2O || 5)),
    fio2: Math.max(21, Math.round((respiratory.fio2 || 0.21) * 100)),
    inspiratoryTime: 1,
    inspiratoryFlow: 30,
    plateauPercent: 0,
    pressureControl: 15,
    volumeGuaranteePressureLimit: 40,
    pressureSupport: 10,
    terminationSensitivity: 25,
    simvSyncWindowPercent: 25,
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

  const currentIeRatio = ieRatioFrom(ventilator)

  const controls = useMemo<Array<InteractiveSettingSpec<VentilatorSettingKey>>>(() => {
    const items: Array<InteractiveSettingSpec<VentilatorSettingKey>> = [
      { key: 'fio2', label: 'FiO₂', value: ventilator.fio2, display: `${Math.round(ventilator.fio2)}`, unit: '%', min: 21, max: 100, step: 1 },
      { key: 'peep', label: 'PEEP', value: ventilator.peep, display: `${Math.round(ventilator.peep)}`, unit: 'cmH₂O', min: 0, max: 20, step: 1 },
    ]

    if (ventilator.mode === 'MANUAL') return items

    if (ventilator.mode !== 'PSV') {
      items.push({ key: 'rate', label: isSimvMode(ventilator.mode) ? 'SIMV RR' : 'RR', value: ventilator.rate, display: `${Math.round(ventilator.rate)}`, unit: '/min', min: 5, max: 40, step: 1 })
    }
    if (usesTidalVolume(ventilator.mode)) {
      items.push({ key: 'tidalVolume', label: ventilator.mode === 'VG-PC' ? 'VT target' : 'VT', value: ventilator.tidalVolume, display: `${Math.round(ventilator.tidalVolume)}`, unit: 'mL', min: 250, max: 800, step: 10 })
    }
    if (hasConventionalMandatoryTiming(ventilator.mode)) {
      items.push({ key: 'ieRatio', label: 'I:E', value: Number(currentIeRatio.toFixed(1)), display: `1:${currentIeRatio.toFixed(1)}`, min: MIN_IE, max: MAX_IE, step: 0.1 })
    }
    if (isVolumeMandatoryMode(ventilator.mode)) {
      items.push(
        { key: 'inspiratoryFlow', label: 'Flow', value: ventilator.inspiratoryFlow, display: `${ventilator.inspiratoryFlow.toFixed(0)}`, unit: 'L/min', min: 10, max: 140, step: 1 },
        { key: 'plateauPercent', label: 'Plateau', value: ventilator.plateauPercent, display: `${ventilator.plateauPercent.toFixed(0)}`, unit: '% Ti', min: 0, max: 20, step: 1 },
      )
    }
    if (isPressureMandatoryMode(ventilator.mode)) {
      items.push({ key: 'pressureControl', label: 'Pinsp', value: ventilator.pressureControl, display: `${ventilator.pressureControl.toFixed(0)}`, unit: 'cmH₂O', min: 5, max: 30, step: 1 })
    }
    if (ventilator.mode === 'VG-PC') {
      items.push({ key: 'volumeGuaranteePressureLimit', label: 'Pmax', value: ventilator.volumeGuaranteePressureLimit, display: `${ventilator.volumeGuaranteePressureLimit.toFixed(0)}`, unit: 'cmH₂O', min: 20, max: 60, step: 1 })
    }
    if (ventilator.mode === 'PSV' || isSimvMode(ventilator.mode)) {
      items.push(
        { key: 'pressureSupport', label: 'PS', value: ventilator.pressureSupport, display: `${ventilator.pressureSupport.toFixed(0)}`, unit: 'cmH₂O', min: 0, max: 25, step: 1 },
        { key: 'terminationSensitivity', label: 'ETS', value: ventilator.terminationSensitivity, display: `${ventilator.terminationSensitivity.toFixed(0)}`, unit: '%', min: 5, max: 80, step: 5 },
      )
    }
    if (isSimvMode(ventilator.mode)) {
      items.push({ key: 'simvSyncWindowPercent', label: 'Sync', value: ventilator.simvSyncWindowPercent, display: `${ventilator.simvSyncWindowPercent.toFixed(0)}`, unit: '%', min: 5, max: 75, step: 5 })
    }
    return items
  }, [currentIeRatio, ventilator])

  const publishRespiratory = (next: VentilatorState) => {
    const currentPatient = patientRef.current
    const currentRespiratory = resolvedMonitorRespiratorySettings(currentPatient)
    const effective = deriveEffectiveVentilation(next, currentRespiratory)
    const nextRespiratory: MonitorRespiratorySettings = {
      ...currentRespiratory,
      respiratoryRate: effective.respiratoryRate,
      tidalVolumeMl: effective.tidalVolumeMl,
      peepCmH2O: next.peep,
      fio2: next.fio2 / 100,
    }
    onPatientStateChange({ ...currentPatient, respiratory: nextRespiratory })
  }

  useEffect(() => {
    const effective = deriveEffectiveVentilation(ventilator, respiratory)
    if (
      Math.abs(effective.respiratoryRate - respiratory.respiratoryRate) > 0.001
      || Math.abs(effective.tidalVolumeMl - respiratory.tidalVolumeMl) > 0.001
    ) {
      publishRespiratory(ventilator)
    }
    // Patient spontaneous breathing is intentionally the only external input
    // that changes effective ventilation without the ventilator itself changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respiratory.spontaneousRespiratoryRate, respiratory.spontaneousTidalVolumeMl])

  const applyValue = (key: VentilatorSettingKey, rawValue: number) => {
    if (disabled) return
    const next = { ...ventilator }
    if (key === 'ieRatio') next.inspiratoryTime = cycleTime(ventilator.rate) / (1 + clamp(rawValue, MIN_IE, MAX_IE))
    else (next as unknown as Record<VentilatorSettingKey, number>)[key] = rawValue
    if (key === 'rate' && hasConventionalMandatoryTiming(ventilator.mode)) {
      const currentRatio = ieRatioFrom(ventilator)
      next.inspiratoryTime = cycleTime(rawValue) / (1 + currentRatio)
    }
    setVentilator(next)
    publishRespiratory(next)
  }

  const selectMode = (mode: EdumonVentilatorMode) => {
    if (disabled) return
    const next = { ...ventilator, mode }
    setVentilator(next)
    publishRespiratory(next)
  }

  const monitoring = useMemo(
    () => deriveEffectiveVentilation(ventilator, respiratory),
    [respiratory.complianceMlPerCmH2O, respiratory.spontaneousRespiratoryRate, respiratory.spontaneousTidalVolumeMl, ventilator],
  )

  if (!host) return null

  return createPortal(
    <section className="edumon-ventilator-row" aria-label="Ventilator settings and monitoring">
      <div className="edumon-ventilator-controls">
        <label className="edumon-ventilator-mode" title={disabled ? 'Ventilator mode controlled by instructor' : 'Change ventilation mode'}>
          <span>VENT MODE</span>
          <select
            disabled={disabled}
            value={ventilator.mode}
            onChange={(event) => selectMode(event.target.value as EdumonVentilatorMode)}
            aria-label="Ventilation mode"
          >
            {MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
        </label>

        <InteractiveSettingControls
          controls={controls}
          onChange={applyValue}
          overlayTargetSelector=".edumon-monitor-body"
          disabled={disabled}
          className="edumon-ventilator-settings"
          ariaLabel="Ventilator settings"
        />
      </div>

      <div className="edumon-ventilator-monitor" aria-label="Ventilator monitored values">
        <div><span>Resp Rate</span><strong>{Math.round(monitoring.respiratoryRate)}</strong><small>/min</small></div>
        <div><span>TV</span><strong>{Math.round(monitoring.tidalVolumeMl)}</strong><small>mL</small></div>
        <div><span>Min Vent</span><strong>{monitoring.minuteVentilationLMin.toFixed(1)}</strong><small>L/min</small></div>
        <div><span>Peak Press</span><strong>{Math.round(monitoring.peakPressureCmH2O)}</strong><small>cmH₂O</small></div>
      </div>
    </section>,
    host,
  )
}
