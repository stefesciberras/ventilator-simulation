import { useSyncExternalStore } from 'react'
import eyesOpen from '../assets/patient-eyes-open.webp'
import eyesHalf from '../assets/patient-eyes-half.webp'
import eyesClosed from '../assets/patient-eyes-closed.webp'
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

const EYE_IMAGE_BY_STATE: Record<PatientEyelidState, string> = {
  open: eyesOpen,
  half: eyesHalf,
  closed: eyesClosed,
}

export function PatientEyeIndicator({ className = '' }: { className?: string }) {
  const appearance = useSyncExternalStore(subscribePatientEyeAppearance, getPatientEyeAppearance, getPatientEyeAppearance)
  const stateLabel = appearance.eyelidState === 'open'
    ? 'eyes open'
    : appearance.eyelidState === 'half'
      ? 'eyes partially closed'
      : 'eyes closed'
  const title = `Patient: ${stateLabel}; pupils L ${appearance.leftPupilMm.toFixed(1)} mm, R ${appearance.rightPupilMm.toFixed(1)} mm`

  return (
    <div className={`patient-eye-indicator ${className}`.trim()} role="img" aria-label={title} title={title}>
      <img src={EYE_IMAGE_BY_STATE[appearance.eyelidState]} alt="" aria-hidden="true" />
    </div>
  )
}
