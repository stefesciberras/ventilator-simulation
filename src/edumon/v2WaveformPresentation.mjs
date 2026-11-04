/**
 * Client-side interpolation of a server-owned simulation clock.
 * Presentation only. Never write this value into canonical physiology.
 * Stop extrapolating after a missed heartbeat instead of running a second
 * independently authoritative clock.
 */
export function v2WaveformPresentationTime({
  simulationTime, receivedAtMs, nowMs, running, speed,
  maxExtrapolationMs = 1250,
}) {
  if (simulationTime == null || !Number.isFinite(simulationTime)) return null
  if (!running) return Math.max(0, simulationTime)
  const elapsed = Math.max(0, Math.min(
    maxExtrapolationMs,
    Number.isFinite(nowMs - receivedAtMs) ? nowMs - receivedAtMs : 0,
  ))
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1
  return Math.max(0, simulationTime + elapsed * safeSpeed / 1000)
}
