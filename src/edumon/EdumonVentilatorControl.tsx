import { useEffect, useMemo, useState } from 'react'
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
const usesTidalVolume = (mode: EdumonVentilatorMode) => mode === 'MANUAL' || isVolumeMandatoryMode(mode) || mode === 'VG-PC'
const hasConventionalMandatoryTiming = (mode: EdumonVentilatorMode) => mode !== 'MANUAL' && mode !== 'PSV'
const ieRatioFrom = (state: VentilatorState) => clamp(cycleTime(state.rate) / Math.max(state.inspiratoryTime, 0.2) - 1, MIN_IE, MAX_IE)

function findVisibleFooterHost(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('.simulation-console-footer .edumon-control-strip'))
  return candidates.find((candidate) => candidate.isConnected && candidate.getClientRects().length > 0)
    ?? candidates.find((candidate) => candidate.isConnected)
    ?? null
}

interface EdumonVentilatorControlProps {
  patientState: MonitorPatientState
  onPatientStateChange: (state: MonitorPatientState) => void
  disabled?: boolean
}

export function EdumonVentilatorControl({ patientState, onPatientStateChange, disabled = false }: EdumonVentilatorControlProps) {
  const respiratory = resolvedMonitorRespiratorySettings(patientState)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [modeOpen, setModeOpen] = useState(false)
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

  useEffect(() => {
    if (disabled) setModeOpen(false)
  }, [disabled])

  const currentIeRatio = ieRatioFrom(ventilator)

  const controls = useMemo<Array<InteractiveSettingSpec<VentilatorSettingKey>>>(() => {
    const items: Array<InteractiveSettingSpec<VentilatorSettingKey>> = [
      { key: 'fio2', label: 'FiO₂', value: ventilator.fio2, display: `${Math.round(ventilator.fio2)}`, unit: '%', min: 21, max: 100, step: 1 },
      { key: 'peep', label: 'PEEP', value: ventilator.peep, display: `${Math.round(ventilator.peep)}`, unit: 'cmH₂O', min: 0, max: 20, step: 1 },
    ]

    if (ventilator.mode === 'MANUAL') {
      items.push({ key: 'tidalVolume', label: 'VT', value: ventilator.tidalVolume, display: `${Math.round(ventilator.tidalVolume)}`, unit: 'mL', min: 250, max: 800, step: 10 })
      return items
    }

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
    const compliance = Math.max(20, respiratory.complianceMlPerCmH2O)
    let tidalVolumeMl = next.tidalVolume
    if (next.mode === 'PC-AC' || next.mode === 'SIMV-PC') tidalVolumeMl = clamp(next.pressureControl * compliance * 0.7, 100, 1000)
    if (next.mode === 'PSV') tidalVolumeMl = clamp(next.pressureSupport * compliance * 0.7, 100, 1000)
    const nextRespiratory: MonitorRespiratorySettings = {
      ...respiratory,
      respiratoryRate: next.mode === 'PSV' ? respiratory.respiratoryRate : next.rate,
      tidalVolumeMl,
      peepCmH2O: next.peep,
      fio2: next.fio2 / 100,
    }
    onPatientStateChange({ ...patientState, respiratory: nextRespiratory })
  }

  const applyValue = (key: VentilatorSettingKey, rawValue: number) => {
    if (disabled) return
    setVentilator((current) => {
      const next = { ...current }
      if (key === 'ieRatio') {
        next.inspiratoryTime = cycleTime(current.rate) / (1 + clamp(rawValue, MIN_IE, MAX_IE))
      } else {
        ;(next as unknown as Record<VentilatorSettingKey, number>)[key] = rawValue
      }
      if (key === 'rate' && hasConventionalMandatoryTiming(current.mode)) next.inspiratoryTime = cycleTime(rawValue) / (1 + currentIeRatio)
      publishRespiratory(next)
      return next
    })
  }

  const selectMode = (mode: EdumonVentilatorMode) => {
    if (disabled) return
    setVentilator((current) => {
      const next = { ...current, mode }
      publishRespiratory(next)
      return next
    })
    setModeOpen(false)
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
      peakPressure = Math.min(ventilator.volumeGuaranteePressureLimit, ventilator.peep + ventilator.tidalVolume / compliance + 4)
    }

    const respiratoryRate = ventilator.mode === 'PSV' ? Math.round(respiratory.respiratoryRate) : ventilator.rate
    return {
      respiratoryRate,
      tidalVolume: Math.round(tidalVolume),
      minuteVentilation: respiratoryRate * tidalVolume / 1000,
      peakPressure: Math.round(peakPressure),
    }
  }, [respiratory.complianceMlPerCmH2O, respiratory.respiratoryRate, ventilator])

  if (!host) return null

  return createPortal(
    <section className="edumon-ventilator-row" aria-label="Ventilator settings and monitoring">
      <div className="edumon-ventilator-controls">
        <div className={`console-mode-control edumon-ventilator-mode ${modeOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="console-mode-button"
            disabled={disabled}
            onClick={() => setModeOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={modeOpen}
            title={disabled ? 'Ventilator mode controlled by instructor' : 'Change ventilation mode'}
          >
            <span>VENT MODE</span>
            <strong>{ventilator.mode === 'MANUAL' ? 'Manual' : ventilator.mode}</strong>
            <b aria-hidden="true">▾</b>
          </button>
          {modeOpen && !disabled && (
            <div className="console-mode-menu edumon-ventilator-mode-menu" role="menu" aria-label="Ventilation mode">
              {MODES.map((mode) => (
                <button key={mode.value} type="button" role="menuitem" className={ventilator.mode === mode.value ? 'selected' : ''} onClick={() => selectMode(mode.value)}>
                  {mode.label}
                </button>
              ))}
            </div>
          )}
        </div>

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
        <div><span>Resp Rate</span><strong>{monitoring.respiratoryRate}</strong><small>/min</small></div>
        <div><span>TV</span><strong>{monitoring.tidalVolume}</strong><small>mL</small></div>
        <div><span>Min Vent</span><strong>{monitoring.minuteVentilation.toFixed(1)}</strong><small>L/min</small></div>
        <div><span>Peak Press</span><strong>{monitoring.peakPressure}</strong><small>cmH₂O</small></div>
      </div>
    </section>,
    host,
  )
}
