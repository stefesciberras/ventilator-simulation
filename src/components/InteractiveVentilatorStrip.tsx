import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { VentilatorMode, VentilatorSettings } from '../simulation/types'
import '../interactive-vent-controls.css'

type SettingKey =
  | 'fio2'
  | 'pHigh'
  | 'pLow'
  | 'tHigh'
  | 'tLow'
  | 'pressureControl'
  | 'peep'
  | 'rate'
  | 'ieRatio'
  | 'tidalVolume'
  | 'inspiratoryFlow'
  | 'plateauPercent'
  | 'volumeGuaranteePressureLimit'
  | 'pressureSupport'
  | 'terminationSensitivity'
  | 'simvSyncWindowPercent'

interface ControlSpec {
  key: SettingKey
  label: string
  value: number
  display: string
  unit: string
  min: number
  max: number
  step: number
}

interface InteractiveVentilatorStripProps {
  settings: VentilatorSettings
  onChange: (next: VentilatorSettings) => void
  disabled?: boolean
  fio2Override?: number
  fio2BoostActive?: boolean
}

interface VentilatorModeControlProps {
  settings: VentilatorSettings
  onChange: (next: VentilatorSettings) => void
  disabled?: boolean
}

const MIN_IE = 0.5
const MAX_IE = 8
const SLIDER_SETTLE_MS = 5200
const MODES: VentilatorMode[] = ['VC-AC', 'SIMV-VC', 'PC-AC', 'SIMV-PC', 'BIPAP', 'VG-PC', 'APRV', 'PSV']
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const cycleTime = (rate: number) => 60 / Math.max(rate, 1)
const isVolumeMandatoryMode = (mode: VentilatorMode) => mode === 'VC-AC' || mode === 'SIMV-VC'
const isPressureMandatoryMode = (mode: VentilatorMode) => mode === 'PC-AC' || mode === 'SIMV-PC'
const isSimvMode = (mode: VentilatorMode) => mode === 'SIMV-VC' || mode === 'SIMV-PC'
const hasConventionalMandatoryTiming = (mode: VentilatorMode) => mode !== 'PSV' && mode !== 'APRV' && mode !== 'BIPAP'
const usesTidalVolume = (mode: VentilatorMode) => isVolumeMandatoryMode(mode) || mode === 'VG-PC'
const ieRatioFrom = (settings: VentilatorSettings) => clamp(cycleTime(settings.rate) / Math.max(settings.inspiratoryTime, 0.2) - 1, MIN_IE, MAX_IE)
const plateauFraction = (settings: VentilatorSettings) => clamp(settings.plateauPercent ?? 0, 0, 20) / 100
const flowFor = (tidalVolumeMl: number, inspiratoryTime: number, plateauPercent: number) => {
  const flowTime = Math.max(inspiratoryTime * (1 - clamp(plateauPercent, 0, 20) / 100), 0.05)
  return (tidalVolumeMl / 1000) / flowTime * 60
}
const reconcileVolumeControlFromFlow = (settings: VentilatorSettings, requestedFlow: number) => {
  const fraction = plateauFraction(settings)
  const cycle = cycleTime(settings.rate)
  const minimumTi = cycle / (1 + MAX_IE)
  const maximumTi = cycle / (1 + MIN_IE)
  const requestedFlowTime = (settings.tidalVolume / 1000) / Math.max(requestedFlow / 60, 0.01)
  const requestedTi = requestedFlowTime / Math.max(1 - fraction, 0.8)
  const inspiratoryTime = clamp(requestedTi, minimumTi, maximumTi)
  const inspiratoryFlow = flowFor(settings.tidalVolume, inspiratoryTime, settings.plateauPercent ?? 0)
  return { inspiratoryTime, inspiratoryFlow }
}

export function VentilatorModeControl({ settings, onChange, disabled = false }: VentilatorModeControlProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const selectMode = (mode: VentilatorMode) => {
    if (disabled) return
    const next: VentilatorSettings = { ...settings, mode }
    if (isVolumeMandatoryMode(mode)) Object.assign(next, reconcileVolumeControlFromFlow(next, next.inspiratoryFlow))
    onChange(next)
    setOpen(false)
  }

  return (
    <div className={`console-mode-control ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="console-mode-button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? 'Ventilator mode controlled by instructor' : 'Change ventilation mode'}
      >
        <span>Mode</span>
        <strong>{settings.mode}</strong>
        <b aria-hidden="true">▾</b>
      </button>
      {open && !disabled && (
        <div className="console-mode-menu" role="menu" aria-label="Ventilation mode">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitem"
              className={settings.mode === mode ? 'selected' : ''}
              onClick={() => selectMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function InteractiveVentilatorStrip({ settings, onChange, disabled = false, fio2Override, fio2BoostActive = false }: InteractiveVentilatorStripProps) {
  const [activeKey, setActiveKey] = useState<SettingKey | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const [overlayTarget, setOverlayTarget] = useState<HTMLElement | null>(null)

  const currentIeRatio = ieRatioFrom(settings)

  const controls = useMemo<ControlSpec[]>(() => {
    const displayedFio2 = Math.round((fio2Override ?? settings.fio2) * 100)
    const specs: ControlSpec[] = [
      { key: 'fio2', label: 'FiO₂', value: displayedFio2, display: `${displayedFio2}`, unit: '%', min: 21, max: 100, step: 1 },
    ]

    if (settings.mode === 'APRV') {
      specs.push(
        { key: 'pHigh', label: 'Phigh', value: settings.pHigh, display: `${settings.pHigh}`, unit: 'cmH₂O', min: 10, max: 40, step: 1 },
        { key: 'pLow', label: 'Plow', value: settings.pLow, display: `${settings.pLow}`, unit: 'cmH₂O', min: 0, max: 15, step: 1 },
        { key: 'tHigh', label: 'Thigh', value: settings.tHigh, display: `${settings.tHigh.toFixed(1)}`, unit: 's', min: 0.5, max: 10, step: 0.1 },
        { key: 'tLow', label: 'Tlow', value: settings.tLow, display: `${settings.tLow.toFixed(2)}`, unit: 's', min: 0.2, max: 2, step: 0.05 },
      )
      return specs
    }

    specs.push({ key: 'peep', label: 'PEEP', value: settings.peep, display: `${settings.peep}`, unit: 'cmH₂O', min: 0, max: 20, step: 1 })

    if (settings.mode === 'BIPAP') {
      specs.push(
        { key: 'pressureControl', label: 'Pinsp', value: settings.pressureControl, display: `${settings.pressureControl}`, unit: 'cmH₂O', min: 5, max: 30, step: 1 },
        { key: 'rate', label: 'RR', value: settings.rate, display: `${settings.rate}`, unit: '/min', min: 5, max: 35, step: 1 },
        { key: 'ieRatio', label: 'I:E', value: Number(currentIeRatio.toFixed(1)), display: `1:${currentIeRatio.toFixed(1)}`, unit: '', min: MIN_IE, max: MAX_IE, step: 0.1 },
      )
      return specs
    }

    if (settings.mode !== 'PSV') specs.push({ key: 'rate', label: isSimvMode(settings.mode) ? 'SIMV RR' : 'RR', value: settings.rate, display: `${settings.rate}`, unit: '/min', min: 5, max: 35, step: 1 })
    if (usesTidalVolume(settings.mode)) specs.push({ key: 'tidalVolume', label: settings.mode === 'VG-PC' ? 'VT target' : 'VT', value: settings.tidalVolume, display: `${settings.tidalVolume}`, unit: 'mL', min: 250, max: 800, step: 10 })
    if (hasConventionalMandatoryTiming(settings.mode)) specs.push({ key: 'ieRatio', label: 'I:E', value: Number(currentIeRatio.toFixed(1)), display: `1:${currentIeRatio.toFixed(1)}`, unit: '', min: MIN_IE, max: MAX_IE, step: 0.1 })
    if (isVolumeMandatoryMode(settings.mode)) {
      specs.push(
        { key: 'inspiratoryFlow', label: 'Flow', value: Number(settings.inspiratoryFlow.toFixed(0)), display: `${settings.inspiratoryFlow.toFixed(0)}`, unit: 'L/min', min: 10, max: 140, step: 1 },
        { key: 'plateauPercent', label: 'Plateau', value: settings.plateauPercent ?? 0, display: `${settings.plateauPercent ?? 0}`, unit: '% Ti', min: 0, max: 20, step: 1 },
      )
    }
    if (isPressureMandatoryMode(settings.mode)) specs.push({ key: 'pressureControl', label: 'Pinsp', value: settings.pressureControl, display: `${settings.pressureControl}`, unit: 'cmH₂O', min: 5, max: 30, step: 1 })
    if (settings.mode === 'VG-PC') specs.push({ key: 'volumeGuaranteePressureLimit', label: 'Pmax', value: settings.volumeGuaranteePressureLimit ?? 40, display: `${settings.volumeGuaranteePressureLimit ?? 40}`, unit: 'cmH₂O', min: 20, max: 60, step: 1 })
    if (settings.mode === 'PSV' || isSimvMode(settings.mode)) {
      specs.push(
        { key: 'pressureSupport', label: 'PS', value: settings.pressureSupport, display: `${settings.pressureSupport}`, unit: 'cmH₂O', min: 0, max: 25, step: 1 },
        { key: 'terminationSensitivity', label: 'ETS', value: settings.terminationSensitivity, display: `${settings.terminationSensitivity}`, unit: '%', min: 5, max: 80, step: 5 },
      )
    }
    if (isSimvMode(settings.mode)) specs.push({ key: 'simvSyncWindowPercent', label: 'Sync', value: settings.simvSyncWindowPercent ?? 25, display: `${settings.simvSyncWindowPercent ?? 25}`, unit: '%', min: 5, max: 75, step: 5 })

    return specs
  }, [settings, currentIeRatio, fio2Override])

  const activeControl = controls.find((control) => control.key === activeKey) ?? null

  const armSettleTimer = () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => {
      setActiveKey(null)
      settleTimerRef.current = null
    }, SLIDER_SETTLE_MS)
  }

  useEffect(() => () => {
    if (settleTimerRef.current != null) window.clearTimeout(settleTimerRef.current)
  }, [])

  useEffect(() => {
    const consoleElement = stripRef.current?.closest('.ventilator-console')
    setOverlayTarget(consoleElement?.querySelector<HTMLElement>('.waveforms') ?? null)
  }, [])

  useEffect(() => {
    if (activeKey && !controls.some((control) => control.key === activeKey)) setActiveKey(null)
    if (fio2BoostActive && activeKey === 'fio2') setActiveKey(null)
  }, [activeKey, controls, fio2BoostActive])

  const selectControl = (key: SettingKey) => {
    if (disabled || (fio2BoostActive && key === 'fio2')) return
    setActiveKey(key)
    armSettleTimer()
  }

  const applyValue = (key: SettingKey, rawValue: number) => {
    if (fio2BoostActive && key === 'fio2') return
    const value = Number(rawValue)
    let next: VentilatorSettings = { ...settings }

    switch (key) {
      case 'fio2':
        next.fio2 = value / 100
        break
      case 'pHigh':
        next.pHigh = Math.max(value, settings.pLow + 1)
        break
      case 'pLow':
        next.pLow = Math.min(value, settings.pHigh - 1)
        break
      case 'tHigh':
        next.tHigh = value
        break
      case 'tLow':
        next.tLow = value
        break
      case 'pressureControl':
        next.pressureControl = value
        break
      case 'peep':
        next.peep = value
        break
      case 'rate': {
        if (isVolumeMandatoryMode(settings.mode)) {
          next.rate = value
          Object.assign(next, reconcileVolumeControlFromFlow(next, settings.inspiratoryFlow))
        } else {
          next.rate = value
          next.inspiratoryTime = cycleTime(value) / (1 + currentIeRatio)
        }
        break
      }
      case 'ieRatio': {
        const ratio = clamp(value, MIN_IE, MAX_IE)
        next.inspiratoryTime = cycleTime(settings.rate) / (1 + ratio)
        if (isVolumeMandatoryMode(settings.mode)) next.inspiratoryFlow = flowFor(next.tidalVolume, next.inspiratoryTime, next.plateauPercent ?? 0)
        break
      }
      case 'tidalVolume':
        next.tidalVolume = value
        if (isVolumeMandatoryMode(settings.mode)) Object.assign(next, reconcileVolumeControlFromFlow(next, settings.inspiratoryFlow))
        break
      case 'inspiratoryFlow':
        Object.assign(next, reconcileVolumeControlFromFlow(settings, value))
        break
      case 'plateauPercent':
        next.plateauPercent = clamp(value, 0, 20)
        Object.assign(next, reconcileVolumeControlFromFlow(next, settings.inspiratoryFlow))
        break
      case 'volumeGuaranteePressureLimit':
        next.volumeGuaranteePressureLimit = value
        break
      case 'pressureSupport':
        next.pressureSupport = value
        break
      case 'terminationSensitivity':
        next.terminationSensitivity = value
        break
      case 'simvSyncWindowPercent':
        next.simvSyncWindowPercent = value
        break
    }

    onChange(next)
    armSettleTimer()
  }

  return (
    <div ref={stripRef} className={`interactive-vent-strip ${disabled ? 'disabled' : ''}`} aria-label="Ventilator display controls">
      <div className="interactive-vent-summary">
        {controls.map((control) => (
          <button
            key={control.key}
            type="button"
            className={`interactive-setting-button ${activeKey === control.key ? 'active' : ''} ${fio2BoostActive && control.key === 'fio2' ? 'oxygen-boosted' : ''}`.trim()}
            disabled={disabled || (fio2BoostActive && control.key === 'fio2')}
            onClick={() => selectControl(control.key)}
            aria-pressed={activeKey === control.key}
            title={disabled ? 'Ventilator settings controlled by instructor' : fio2BoostActive && control.key === 'fio2' ? 'O₂ enrichment temporarily overrides FiO₂ to 100%' : `Adjust ${control.label}`}
          >
            <span>{control.label}</span>
            <strong><b>{control.display}</b>{control.unit && <small>{control.unit}</small>}</strong>
          </button>
        ))}
      </div>
      {activeControl && !disabled && overlayTarget && createPortal(
        <div className="interactive-slider-panel" role="group" aria-label={`Adjust ${activeControl.label}`}>
          <span>{activeControl.label}</span>
          <input
            className="interactive-vent-slider"
            type="range"
            min={activeControl.min}
            max={activeControl.max}
            step={activeControl.step}
            value={activeControl.value}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              armSettleTimer()
            }}
            onPointerUp={armSettleTimer}
            onPointerCancel={armSettleTimer}
            onKeyDown={armSettleTimer}
            onInput={(event) => applyValue(activeControl.key, Number(event.currentTarget.value))}
            onChange={(event) => applyValue(activeControl.key, Number(event.currentTarget.value))}
          />
          <strong>{activeControl.display}{activeControl.unit ? ` ${activeControl.unit}` : ''}</strong>
        </div>,
        overlayTarget,
      )}
    </div>
  )
}
