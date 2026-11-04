/**
 * Pure shared Anaesth measurement model. The existing v1 BIS uses jitter for
 * display presentation, while v2 checkpoints an unjittered deterministic BIS
 * index. Measurements here are educational simulations, never clinical values.
 */
const clamp = (x, min, max) => Math.max(min, Math.min(max, x))
export const BIS_TIME_CONSTANT_SECONDS = 8
export const BIS_TARGETS = Object.freeze({ 1: 20, 2: 35, 3: 50, 4: 80, 5: 100 })
export function bisTargetForDepth(depth) {
  if (!Number.isInteger(depth) || depth < 1 || depth > 5) throw Error('invalid-bis-depth')
  return BIS_TARGETS[depth]
}
export function advanceBisIndex(previous, depth, deltaSeconds) {
  if (!Number.isFinite(previous) || previous < 0 || previous > 100 ||
      !Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 60) {
    throw Error('invalid-bis-step')
  }
  if (depth === 5) return 100
  const target = bisTargetForDepth(depth)
  return clamp(previous + (target - previous) *
    (1 - Math.exp(-deltaSeconds / BIS_TIME_CONSTANT_SECONDS)), 0, 100)
}
export function tofReadingFromBlock(block, minimumCount = 0) {
  if (!Number.isFinite(block) || !Number.isFinite(minimumCount)) throw Error('invalid-tof-input')
  const residualBlock = clamp(block, 0, 1)
  let count = residualBlock >= 0.95 ? 0 : residualBlock >= 0.8 ? 1 :
    residualBlock >= 0.6 ? 2 : residualBlock >= 0.35 ? 3 : 4
  count = Math.max(count, Math.round(clamp(minimumCount, 0, 4)))
  return { count, ratio: count < 4 ? 0 : clamp(1 - residualBlock * 1.2, 0, 1) }
}
