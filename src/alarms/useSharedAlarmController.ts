import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TeachingRole } from '../teaching/types'
import { deriveAlarmSessionSemantics, useTeachingAlarmSync, type AlarmPermissionPolicy } from '../teaching/session/useTeachingAlarmSync'
import { recordSessionLogEvent } from '../teaching/session/sessionLog'

export type SharedAlarmPriority = 'warning' | 'critical'
export type SharedAlarmDisplayLevel = 'grey' | 'yellow' | 'red' | null
export type SharedAlarmAudibleLevel = 'yellow' | 'red' | null

export interface SharedAlarmEvaluation {
  key: string
  label: string
  active: boolean
  priority?: SharedAlarmPriority
  immediateCritical?: boolean
  visible?: boolean
}

export interface SharedAlarmLifecycleEntry {
  activeSince: number | null
  resolvedAt: number | null
  acknowledged: boolean
}

export interface SharedAlarmControllerOptions {
  role: TeachingRole
  sessionId: string | null
  policy: AlarmPermissionPolicy
  evaluations: readonly SharedAlarmEvaluation[]
  paused?: boolean
  audible?: boolean
  resolvedWarningMs?: number
  retainedMs?: number
  criticalEscalationMs?: number
  onAudibleLevelChange?: (level: SharedAlarmAudibleLevel) => void
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function useSharedAlarmController({
  role,
  sessionId,
  policy,
  evaluations,
  paused = false,
  audible = true,
  resolvedWarningMs = 10_000,
  retainedMs = 120_000,
  criticalEscalationMs = 15_000,
  onAudibleLevelChange,
}: SharedAlarmControllerOptions) {
  const [clock, setClock] = useState(() => Date.now())
  const [localSilenceUntil, setLocalSilenceUntil] = useState<number | null>(null)
  const [lifecycle, setLifecycle] = useState<Record<string, SharedAlarmLifecycleEntry>>({})
  const audioContextRef = useRef<AudioContext | null>(null)
  const loggedActiveAlarmsRef = useRef<Map<string, string>>(new Map())
  const semantics = deriveAlarmSessionSemantics(role, policy)
  const sessionSync = useTeachingAlarmSync(role, sessionId)

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const now = Date.now()
    setLifecycle((current) => {
      let changed = false
      const next = { ...current }
      const currentKeys = new Set(evaluations.map((evaluation) => evaluation.key))
      for (const key of Object.keys(next)) {
        if (!currentKeys.has(key)) { delete next[key]; changed = true }
      }
      for (const evaluation of evaluations) {
        if (evaluation.visible === false) {
          if (next[evaluation.key]) { delete next[evaluation.key]; changed = true }
          continue
        }
        const entry = current[evaluation.key] ?? { activeSince: null, resolvedAt: null, acknowledged: false }
        if (evaluation.active) {
          if (entry.activeSince == null || entry.resolvedAt != null) {
            next[evaluation.key] = { activeSince: now, resolvedAt: null, acknowledged: false }
            changed = true
          }
        } else if (entry.activeSince != null && entry.resolvedAt == null) {
          next[evaluation.key] = { ...entry, resolvedAt: now }
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [evaluations])

  useEffect(() => {
    if (role !== 'standalone' && !sessionId) {
      loggedActiveAlarmsRef.current = new Map(
        evaluations.filter((evaluation) => evaluation.visible !== false && evaluation.active).map((evaluation) => [evaluation.key, evaluation.label]),
      )
      return
    }

    const previous = loggedActiveAlarmsRef.current
    const next = new Map<string, string>()
    for (const evaluation of evaluations) {
      if (evaluation.visible === false) continue
      if (evaluation.active) {
        next.set(evaluation.key, evaluation.label)
        if (!previous.has(evaluation.key)) {
          void recordSessionLogEvent({
            sessionId: sessionId ?? undefined,
            category: 'alarm',
            eventType: 'alarm.activated',
            label: `Alarm: ${evaluation.label}`,
            details: { key: evaluation.key, priority: evaluation.priority ?? 'warning' },
          }).catch(() => undefined)
        }
      } else if (previous.has(evaluation.key)) {
        void recordSessionLogEvent({
          sessionId: sessionId ?? undefined,
          category: 'alarm',
          eventType: 'alarm.resolved',
          label: `Alarm cleared: ${evaluation.label}`,
          details: { key: evaluation.key, priority: evaluation.priority ?? 'warning' },
        }).catch(() => undefined)
      }
    }
    for (const [key, label] of previous) {
      if (!evaluations.some((evaluation) => evaluation.key === key && evaluation.visible !== false)) {
        void recordSessionLogEvent({
          sessionId: sessionId ?? undefined,
          category: 'alarm',
          eventType: 'alarm.resolved',
          label: `Alarm cleared: ${label}`,
          details: { key },
        }).catch(() => undefined)
      }
    }
    loggedActiveAlarmsRef.current = next
  }, [evaluations, role, sessionId])

  useEffect(() => {
    setLifecycle((current) => {
      let changed = false
      const next = { ...current }
      for (const [key, entry] of Object.entries(current)) {
        if (entry.resolvedAt != null && clock - entry.resolvedAt >= retainedMs) { delete next[key]; changed = true }
      }
      return changed ? next : current
    })
  }, [clock, retainedMs])

  const evaluationByKey = useMemo(() => new Map(evaluations.map((evaluation) => [evaluation.key, evaluation])), [evaluations])
  const activeKeys = useMemo(() => evaluations.filter((evaluation) => evaluation.visible !== false && evaluation.active).map((evaluation) => evaluation.key), [evaluations])
  const resolvedYellowKeys = useMemo(() => Object.entries(lifecycle).filter(([key, entry]) => evaluationByKey.get(key)?.visible !== false && entry.resolvedAt != null && clock - entry.resolvedAt < resolvedWarningMs).map(([key]) => key), [clock, evaluationByKey, lifecycle, resolvedWarningMs])
  const greyKeys = useMemo(() => Object.entries(lifecycle).filter(([key, entry]) => evaluationByKey.get(key)?.visible !== false && entry.resolvedAt != null && clock - entry.resolvedAt >= resolvedWarningMs && clock - entry.resolvedAt < retainedMs && !entry.acknowledged).map(([key]) => key), [clock, evaluationByKey, lifecycle, resolvedWarningMs, retainedMs])

  const criticalEscalated = evaluations.some((evaluation) => {
    if (!evaluation.active || evaluation.visible === false || evaluation.priority !== 'critical') return false
    if (evaluation.immediateCritical) return true
    const entry = lifecycle[evaluation.key]
    return Boolean(entry?.activeSince != null && clock - entry.activeSince >= criticalEscalationMs)
  })

  const audibleLevel: SharedAlarmAudibleLevel = activeKeys.length || resolvedYellowKeys.length ? (criticalEscalated ? 'red' : 'yellow') : null
  const level: SharedAlarmDisplayLevel = audibleLevel ?? (greyKeys.length ? 'grey' : null)
  const visibleKeys = useMemo(() => new Set([...activeKeys, ...resolvedYellowKeys, ...greyKeys]), [activeKeys, greyKeys, resolvedYellowKeys])
  const labels = evaluations.filter((evaluation) => visibleKeys.has(evaluation.key)).map((evaluation) => evaluation.label)

  useEffect(() => { onAudibleLevelChange?.(audibleLevel) }, [audibleLevel, onAudibleLevelChange])

  const syncedSilenceUntil = sessionSync.state.silenceUntil
  const syncedSilent = Boolean(sessionSync.state.instructorOverride || (syncedSilenceUntil ?? 0) > clock)
  const localSilent = Boolean((localSilenceUntil ?? 0) > clock)
  const silenced = semantics.forcedSilent || syncedSilent || localSilent
  const silenceUntil = Math.max(localSilenceUntil ?? 0, syncedSilenceUntil ?? 0) || null
  const silenceRemainingSeconds = silenceUntil == null ? 0 : Math.max(0, Math.ceil((silenceUntil - clock) / 1000))
  const silenceLabel = silenceRemainingSeconds > 0 ? formatRemaining(silenceRemainingSeconds) : undefined

  useEffect(() => {
    if (localSilenceUntil != null && localSilenceUntil <= clock) setLocalSilenceUntil(null)
  }, [clock, localSilenceUntil])

  const acknowledgeCurrent = useCallback(() => {
    setLifecycle((current) => {
      const next = { ...current }
      let changed = false
      for (const [key, entry] of Object.entries(current)) {
        const evaluation = evaluationByKey.get(key)
        if (entry.resolvedAt != null) { delete next[key]; changed = true }
        else if (evaluation?.active && !entry.acknowledged) { next[key] = { ...entry, acknowledged: true }; changed = true }
      }
      return changed ? next : current
    })
  }, [evaluationByKey])

  const silenceFor = useCallback((durationMs: number) => {
    if (semantics.candidateLocked) return
    const boundedDuration = Math.max(0, durationMs)
    const until = Date.now() + boundedDuration
    acknowledgeCurrent()
    setLocalSilenceUntil(until)
    if (role === 'instructor' && sessionId) sessionSync.silenceFor(boundedDuration)
    void recordSessionLogEvent({
      sessionId: sessionId ?? undefined,
      category: 'alarm',
      eventType: 'alarm.silenced',
      label: `Alarm silenced for ${Math.round(boundedDuration / 1000)} s`,
      details: { durationMs: boundedDuration, until: new Date(until).toISOString() },
    }).catch(() => undefined)
  }, [acknowledgeCurrent, role, semantics.candidateLocked, sessionId, sessionSync])

  const clearSilence = useCallback(() => {
    if (semantics.candidateLocked) return
    setLocalSilenceUntil(null)
    if (role === 'instructor' && sessionId) sessionSync.clearSilence()
    void recordSessionLogEvent({
      sessionId: sessionId ?? undefined,
      category: 'alarm',
      eventType: 'alarm.silence_cleared',
      label: 'Alarm silence cleared',
    }).catch(() => undefined)
  }, [role, semantics.candidateLocked, sessionId, sessionSync])

  const needsAttention = useCallback((...keys: string[]) => keys.some((key) => {
    const entry = lifecycle[key]
    if (entry?.acknowledged) return false
    const evaluation = evaluationByKey.get(key)
    if (evaluation?.active && evaluation.visible !== false) return true
    return entry?.resolvedAt != null && clock - entry.resolvedAt < retainedMs
  }), [clock, evaluationByKey, lifecycle, retainedMs])

  useEffect(() => {
    if (!audible || !audibleLevel || silenced || paused) return
    const beep = () => {
      try {
        const AudioContextConstructor = window.AudioContext
        if (!AudioContextConstructor) return
        const context = audioContextRef.current ?? new AudioContextConstructor()
        audioContextRef.current = context
        if (context.state === 'suspended') void context.resume()
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'square'
        oscillator.frequency.value = audibleLevel === 'red' ? 1040 : 820
        gain.gain.setValueAtTime(0.0001, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start()
        oscillator.stop(context.currentTime + 0.13)
      } catch { /* Browser audio can remain blocked until a user gesture. */ }
    }
    beep()
    const timer = window.setInterval(beep, audibleLevel === 'red' ? 700 : 1300)
    return () => window.clearInterval(timer)
  }, [audible, audibleLevel, paused, silenced])

  useEffect(() => () => { void audioContextRef.current?.close() }, [])

  return {
    lifecycle,
    activeKeys,
    resolvedYellowKeys,
    greyKeys,
    visibleKeys,
    labels,
    audibleLevel,
    level,
    silenced,
    silenceUntil,
    silenceRemainingSeconds,
    silenceLabel,
    candidateLocked: semantics.candidateLocked,
    forcedSilent: semantics.forcedSilent,
    instructorControlsAlarms: semantics.instructorControlsAlarms,
    acknowledgeCurrent,
    silenceFor,
    clearSilence,
    needsAttention,
    setInstructorOverride: sessionSync.setInstructorOverride,
  }
}
