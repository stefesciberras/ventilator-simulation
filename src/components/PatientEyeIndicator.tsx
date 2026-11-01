import { useSyncExternalStore } from 'react'
import './PatientEyeIndicator.css'

export type PatientEyelidState = 'open' | 'half' | 'closed'

export interface PatientEyeAppearance {
  eyelidState: PatientEyelidState
  leftPupilMm: number
  rightPupilMm: number
  leftReactive: boolean
  rightReactive: boolean
}

const DEFAULT_PATIENT_EYE_APPEARANCE: PatientEyeAppearance = {
  eyelidState: 'open',
  leftPupilMm: 3,
  rightPupilMm: 3,
  leftReactive: true,
  rightReactive: true,
}

let patientEyeAppearance = DEFAULT_PATIENT_EYE_APPEARANCE
const patientEyeListeners = new Set<() => void>()

export function setPatientEyeAppearance(patch: Partial<PatientEyeAppearance>): void {
  const next = { ...patientEyeAppearance, ...patch }
  if (
    next.eyelidState === patientEyeAppearance.eyelidState
    && next.leftPupilMm === patientEyeAppearance.leftPupilMm
    && next.rightPupilMm === patientEyeAppearance.rightPupilMm
    && next.leftReactive === patientEyeAppearance.leftReactive
    && next.rightReactive === patientEyeAppearance.rightReactive
  ) return

  patientEyeAppearance = next
  patientEyeListeners.forEach((listener) => listener())
}

export function resetPatientEyeAppearance(): void {
  patientEyeAppearance = DEFAULT_PATIENT_EYE_APPEARANCE
  patientEyeListeners.forEach((listener) => listener())
}

function subscribePatientEyeAppearance(listener: () => void): () => void {
  patientEyeListeners.add(listener)
  return () => patientEyeListeners.delete(listener)
}

function getPatientEyeAppearance(): PatientEyeAppearance {
  return patientEyeAppearance
}

function pupilRadius(pupilMm: number): number {
  const clamped = Math.max(1, Math.min(8, pupilMm))
  return 1.2 + ((clamped - 1) / 7) * 2.8
}

function Eye({
  side,
  eyelidState,
  pupilMm,
  reactive,
}: {
  side: 'left' | 'right'
  eyelidState: PatientEyelidState
  pupilMm: number
  reactive: boolean
}) {
  const offset = side === 'left' ? 0 : 31
  const cx = offset + 15.5
  const radius = pupilRadius(pupilMm)

  if (eyelidState === 'closed') {
    return (
      <g className="patient-eye patient-eye-closed">
        <path d={`M${offset + 3} 15 Q${cx} 8 ${offset + 28} 15`} />
        <path d={`M${offset + 5} 16 Q${cx} 20 ${offset + 26} 16`} className="patient-eye-lid-shadow" />
      </g>
    )
  }

  const lowerY = eyelidState === 'half' ? 15 : 21
  const upperY = eyelidState === 'half' ? 13 : 7
  const pupilCy = eyelidState === 'half' ? 14.5 : 14

  return (
    <g className={`patient-eye patient-eye-${eyelidState}`} data-reactive={reactive ? 'true' : 'false'}>
      <path d={`M${offset + 3} 14 Q${cx} ${upperY} ${offset + 28} 14 Q${cx} ${lowerY} ${offset + 3} 14 Z`} className="patient-eye-sclera" />
      <circle cx={cx} cy={pupilCy} r="5" className="patient-eye-iris" />
      <circle cx={cx} cy={pupilCy} r={radius} className="patient-eye-pupil" />
      {reactive && <circle cx={cx - 1.8} cy={pupilCy - 1.8} r="0.9" className="patient-eye-highlight" />}
      {eyelidState === 'half' && <path d={`M${offset + 3} 14 Q${cx} 8 ${offset + 28} 14`} className="patient-eye-upper-lid" />}
    </g>
  )
}

export function PatientEyeIndicator({ className = '' }: { className?: string }) {
  const appearance = useSyncExternalStore(subscribePatientEyeAppearance, getPatientEyeAppearance, getPatientEyeAppearance)
  const stateLabel = appearance.eyelidState === 'open' ? 'eyes open' : appearance.eyelidState === 'half' ? 'eyes partially closed' : 'eyes closed'
  const title = `Patient: ${stateLabel}; pupils L ${appearance.leftPupilMm.toFixed(1)} mm, R ${appearance.rightPupilMm.toFixed(1)} mm`

  return (
    <div className={`patient-eye-indicator ${className}`.trim()} role="img" aria-label={title} title={title}>
      <svg viewBox="0 0 62 28" aria-hidden="true">
        <Eye side="left" eyelidState={appearance.eyelidState} pupilMm={appearance.leftPupilMm} reactive={appearance.leftReactive} />
        <Eye side="right" eyelidState={appearance.eyelidState} pupilMm={appearance.rightPupilMm} reactive={appearance.rightReactive} />
      </svg>
    </div>
  )
}
