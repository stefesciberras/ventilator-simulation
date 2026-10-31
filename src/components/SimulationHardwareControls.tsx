import { useEffect, useRef } from 'react'
import { LOPPJUSIM_SIMULATION_RESET_EVENT } from '../core/platformEvents'

export function FreezeWaveformIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 9h4V5l5 7-5 7v-4H2zm20 0h-4V5l-5 7 5 7v-4h4zM11 3h2v18h-2z" fill="currentColor" />
    </svg>
  )
}

export function LaserPointerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="17" r="2.2" fill="currentColor" />
      <path d="M9 15l8.5-8.5M13.5 6.5l4 4M17.5 3.5l3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function AlarmSilenceIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9a7 7 0 0 1 11.8-5.1M18.7 7.2A7 7 0 0 1 19 9v4l2 3H8M10 20h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface SimulationHardwareControlsProps {
  laserActive: boolean
  onLaserToggle: () => void
  laserDisabled?: boolean
  frozen: boolean
  onFreezeToggle: () => void
  freezeDisabled?: boolean
  alarmSilenced?: boolean
  alarmLabel?: string
  onAlarmSilence: (durationMs: number) => void
  alarmDisabled?: boolean
  children?: React.ReactNode
  className?: string
  alarmTimerClassName?: string
}

const SHORT_ALARM_SILENCE_MS = 120_000
const LONG_ALARM_SILENCE_MS = 600_000
const LONG_PRESS_MS = 800

export function SimulationHardwareControls({
  laserActive,
  onLaserToggle,
  laserDisabled = false,
  frozen,
  onFreezeToggle,
  freezeDisabled = false,
  alarmSilenced = false,
  alarmLabel,
  onAlarmSilence,
  alarmDisabled = false,
  children,
  className = '',
  alarmTimerClassName = '',
}: SimulationHardwareControlsProps) {
  const longPressTimer = useRef<number | null>(null)
  const longPressTriggered = useRef(false)

  useEffect(() => {
    const resetDisplayState = () => {
      if (laserActive && !laserDisabled) onLaserToggle()
      if (frozen && !freezeDisabled) onFreezeToggle()
      if (alarmSilenced && !alarmDisabled) onAlarmSilence(0)
    }
    window.addEventListener(LOPPJUSIM_SIMULATION_RESET_EVENT, resetDisplayState)
    return () => window.removeEventListener(LOPPJUSIM_SIMULATION_RESET_EVENT, resetDisplayState)
  }, [alarmDisabled, alarmSilenced, freezeDisabled, frozen, laserActive, laserDisabled, onAlarmSilence, onFreezeToggle, onLaserToggle])

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const startLongPress = () => {
    if (alarmDisabled) return
    clearLongPress()
    longPressTriggered.current = false
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true
      longPressTimer.current = null
      onAlarmSilence(LONG_ALARM_SILENCE_MS)
    }, LONG_PRESS_MS)
  }

  const handleAlarmClick = () => {
    if (alarmDisabled) return
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    onAlarmSilence(SHORT_ALARM_SILENCE_MS)
  }

  return (
    <div className={`action-bar console-top-actions ${className}`.trim()} aria-label="Display actions">
      <button type="button" disabled={laserDisabled} className={`hardware-button icon-button teaching-laser-console-button ${laserActive ? 'active' : ''}`} onClick={onLaserToggle} title={laserDisabled ? 'Laser pointer controlled by instructor' : 'Laser pointer'} aria-label={laserDisabled ? 'Laser pointer controlled by instructor' : 'Laser pointer'} aria-pressed={laserActive}><LaserPointerIcon /></button>
      <button type="button" disabled={freezeDisabled} className={`hardware-button icon-button freeze-button ${frozen ? 'active' : ''}`} onClick={onFreezeToggle} title={freezeDisabled ? 'Waveform freeze controlled by instructor' : (frozen ? 'Resume waveforms' : 'Freeze waveforms')} aria-label={freezeDisabled ? 'Waveform freeze controlled by instructor' : (frozen ? 'Resume waveforms' : 'Freeze waveforms')}><FreezeWaveformIcon /></button>
      <button
        type="button"
        disabled={alarmDisabled}
        className={`hardware-button icon-button alarm-button ${alarmSilenced ? 'active' : ''}`}
        onClick={handleAlarmClick}
        onPointerDown={startLongPress}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onContextMenu={(event) => event.preventDefault()}
        title={alarmDisabled ? 'Alarm silence controlled by instructor' : (alarmSilenced && alarmLabel ? `Alarm silenced for ${alarmLabel}` : 'Silence alarms for 2 minutes; hold for 10 minutes')}
        aria-label={alarmDisabled ? 'Alarm silence controlled by instructor' : (alarmSilenced && alarmLabel ? `Alarm silenced for ${alarmLabel}` : 'Alarm silence')}
      ><AlarmSilenceIcon /></button>
      {alarmSilenced && alarmLabel && <span className={`alarm-silence-timer ${alarmTimerClassName}`.trim()}>{alarmLabel}</span>}
      {children}
    </div>
  )
}
