import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MonitorPatientState } from './types'
import { measurementsFor } from './monitorEngine'
import './edumon-nibp.css'

type NibpInterval = 'off' | '2m' | '3m' | '5m'
type NibpPhase = 'idle' | 'inflating' | 'deflating'

type NibpReading = {
  systolic: number
  diastolic: number
  mean: number
  measuredAt: number
}

const INFLATE_MS = 2200
const DEFLATE_MS = 5800
const INTERVAL_MS: Record<Exclude<NibpInterval, 'off'>, number> = {
  '2m': 2 * 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function pseudoRandom(index: number, salt: number) {
  const raw = Math.sin((index + 1) * 12.9898 + salt) * 43758.5453
  return raw - Math.floor(raw)
}

function deriveNibpReading(patientState: MonitorPatientState, cycleIndex: number): NibpReading {
  const measured = measurementsFor(patientState)
  const invasiveSystolic = measured.systolicPressure ?? Math.round(patientState.systolicPressure)
  const invasiveDiastolic = measured.diastolicPressure ?? Math.round(patientState.diastolicPressure)
  const invasiveMean = measured.meanPressure ?? Math.round(invasiveDiastolic + (invasiveSystolic - invasiveDiastolic) / 3)

  const systolicFactor = 1 + (pseudoRandom(cycleIndex, 17.3) * 2 - 1) * 0.08
  const targetMeanFactor = 1 + (pseudoRandom(cycleIndex, 41.7) * 2 - 1) * 0.025
  const systolic = Math.round(clamp(invasiveSystolic * systolicFactor, invasiveSystolic * 0.9, invasiveSystolic * 1.1))
  const targetMean = invasiveMean * targetMeanFactor
  const derivedDiastolic = (3 * targetMean - systolic) / 2
  const diastolic = Math.round(clamp(
    derivedDiastolic,
    Math.max(20, invasiveDiastolic * 0.9),
    Math.min(systolic - 5, invasiveDiastolic * 1.1),
  ))
  const mean = Math.round(diastolic + (systolic - diastolic) / 3)

  return { systolic, diastolic, mean, measuredAt: Date.now() }
}

function playNibpStartSound(audioContextRef: React.MutableRefObject<AudioContext | null>) {
  if (typeof window === 'undefined') return
  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return

  const context = audioContextRef.current ?? new AudioContextCtor()
  audioContextRef.current = context
  void context.resume()
  const now = context.currentTime

  const beep = context.createOscillator()
  const beepGain = context.createGain()
  beep.type = 'sine'
  beep.frequency.setValueAtTime(880, now)
  beepGain.gain.setValueAtTime(0.0001, now)
  beepGain.gain.exponentialRampToValueAtTime(0.14, now + 0.01)
  beepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)
  beep.connect(beepGain).connect(context.destination)
  beep.start(now)
  beep.stop(now + 0.12)

  const pump = context.createOscillator()
  const pumpGain = context.createGain()
  const pumpFilter = context.createBiquadFilter()
  pump.type = 'sawtooth'
  pump.frequency.setValueAtTime(54, now + 0.14)
  pump.frequency.linearRampToValueAtTime(67, now + 2.1)
  pumpFilter.type = 'lowpass'
  pumpFilter.frequency.value = 260
  pumpGain.gain.setValueAtTime(0.0001, now + 0.13)
  pumpGain.gain.linearRampToValueAtTime(0.055, now + 0.22)
  for (let pulse = 0; pulse < 9; pulse += 1) {
    const t = now + 0.25 + pulse * 0.21
    pumpGain.gain.setValueAtTime(0.025, t)
    pumpGain.gain.linearRampToValueAtTime(0.065, t + 0.08)
    pumpGain.gain.linearRampToValueAtTime(0.03, t + 0.18)
  }
  pumpGain.gain.linearRampToValueAtTime(0.0001, now + 2.18)
  pump.connect(pumpFilter).connect(pumpGain).connect(context.destination)
  pump.start(now + 0.14)
  pump.stop(now + 2.2)
}

export function EdumonNibpControl({ patientState }: { patientState: MonitorPatientState }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<NibpPhase>('idle')
  const [cuffPressure, setCuffPressure] = useState(0)
  const [reading, setReading] = useState<NibpReading | null>(null)
  const [interval, setIntervalMode] = useState<NibpInterval>('off')
  const intervalRef = useRef<NibpInterval>('off')
  const patientRef = useRef(patientState)
  const cycleIndexRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const scheduledRef = useRef<number | null>(null)
  const measuringRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  patientRef.current = patientState
  intervalRef.current = interval

  useEffect(() => {
    const findHost = () => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('.simulation-console-footer .edumon-control-strip'))
      const visibleHost = candidates.find((candidate) => candidate.isConnected && candidate.getClientRects().length > 0)
        ?? candidates.find((candidate) => candidate.isConnected)
        ?? null
      setHost((current) => current === visibleHost ? current : visibleHost)
    }

    findHost()
    const observer = new MutationObserver(findHost)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', findHost)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', findHost)
    }
  }, [])

  const clearTimers = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current)
    if (scheduledRef.current != null) window.clearTimeout(scheduledRef.current)
    timerRef.current = null
    scheduledRef.current = null
  }, [])

  const startMeasurement = useCallback(() => {
    if (measuringRef.current) return
    clearTimers()
    measuringRef.current = true
    setOpen(false)
    setPhase('inflating')
    setCuffPressure(0)
    playNibpStartSound(audioContextRef)

    const target = deriveNibpReading(patientRef.current, cycleIndexRef.current)
    cycleIndexRef.current += 1
    const peakPressure = clamp(Math.max(target.systolic + 45, 160), 160, 220)
    const startedAt = performance.now()

    timerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      if (elapsed <= INFLATE_MS) {
        setPhase('inflating')
        setCuffPressure(Math.round(peakPressure * (elapsed / INFLATE_MS)))
        return
      }

      if (elapsed <= INFLATE_MS + DEFLATE_MS) {
        setPhase('deflating')
        const fraction = (elapsed - INFLATE_MS) / DEFLATE_MS
        setCuffPressure(Math.round(peakPressure - (peakPressure - 35) * fraction))
        return
      }

      clearTimers()
      measuringRef.current = false
      setPhase('idle')
      setCuffPressure(0)
      setReading(target)

      const selected = intervalRef.current
      if (selected === 'off') return
      scheduledRef.current = window.setTimeout(startMeasurement, INTERVAL_MS[selected])
    }, 80)
  }, [clearTimers])

  useEffect(() => () => {
    clearTimers()
    void audioContextRef.current?.close()
  }, [clearTimers])

  const chooseInterval = (next: NibpInterval) => {
    setIntervalMode(next)
    intervalRef.current = next
    if (scheduledRef.current != null) {
      window.clearTimeout(scheduledRef.current)
      scheduledRef.current = null
    }
    if (next !== 'off' && !measuringRef.current) startMeasurement()
  }

  const runStat = () => {
    setIntervalMode('off')
    intervalRef.current = 'off'
    if (scheduledRef.current != null) {
      window.clearTimeout(scheduledRef.current)
      scheduledRef.current = null
    }
    startMeasurement()
  }

  if (!host) return null

  const status = phase === 'idle'
    ? (reading ? `${reading.systolic}/${reading.diastolic} (${reading.mean})` : '—/—')
    : `${cuffPressure}`
  const detail = phase === 'idle'
    ? (interval === 'off' ? 'Press for NIBP' : `Cycle ${interval.toUpperCase()}`)
    : `Cuff mmHg · ${phase === 'inflating' ? 'inflating' : 'measuring'}`

  return createPortal(<>
    <button
      type="button"
      className={`edumon-control-tile edumon-nibp-tile ${phase !== 'idle' ? 'measuring' : ''}`}
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      aria-haspopup="dialog"
      title="NIBP — press to measure or set automatic interval"
    >
      <span>NIBP</span>
      <strong>{status}</strong>
      <small>{detail}</small>
    </button>
    {open && (
      <div className="edumon-nibp-popover" role="dialog" aria-label="NIBP measurement settings">
        <div className="edumon-nibp-popover-heading"><strong>NIBP</strong><span>Measurement interval</span></div>
        <div className="edumon-nibp-intervals">
          <button type="button" onClick={runStat}>STAT</button>
          {(['2m', '3m', '5m'] as NibpInterval[]).map((option) => (
            <button key={option} type="button" className={interval === option ? 'active' : ''} onClick={() => chooseInterval(option)}>
              {option.toUpperCase()}
            </button>
          ))}
          <button type="button" className={interval === 'off' ? 'active' : ''} onClick={() => chooseInterval('off')}>Off</button>
        </div>
      </div>
    )}
  </>, host)
}
