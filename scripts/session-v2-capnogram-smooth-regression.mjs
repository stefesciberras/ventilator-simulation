import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { v2WaveformPresentationTime } from '../src/edumon/v2WaveformPresentation.mjs'

const view = options => v2WaveformPresentationTime({
  simulationTime: 40, receivedAtMs: 10000, nowMs: 10500,
  running: true, speed: 1, ...options,
})
assert.equal(view({}), 40.5, 'authoritative 1x clock interpolates between snapshots')
assert.equal(view({ speed: 0.5 }), 40.25)
assert.equal(view({ speed: 2 }), 41)
assert.equal(view({ speed: 4 }), 42)
assert.equal(view({ running: false }), 40, 'paused authority must freeze trace')
assert.equal(view({ simulationTime: null }), null, 'no snapshot must not fake a running trace')
assert.equal(view({ nowMs: 10000 }), 40)
assert.equal(view({ nowMs: 9000 }), 40, 'negative wall time cannot rewind trace')
assert.equal(view({ nowMs: 15000 }), 41.25, 'after missed heartbeat presentation stops extrapolation')
assert.equal(view({ nowMs: 15000, speed: 4 }), 45)
assert.equal(view({ simulationTime: 0, receivedAtMs: 10000, nowMs: 10000 }), 0,
  'reset begins at time zero without replay')
assert.equal(view({ running: false, simulationTime: 120 }), 120,
  'reconnect restores canonical frozen session time')
const read = path => readFileSync(path, 'utf8')
const capno = read('src/edumon/EdumonCapnographySurface.tsx')
const preview = read('src/edumon/AnaesthSessionV2Preview.tsx')
assert.ok(preview.includes('clockRunning: authorityClock.running'),
  'v2 preview must pass server clock mode to capnogram')
assert.ok(preview.includes('clockSpeed: authorityClock.speed'),
  'v2 preview must pass server speed to capnogram')
assert.ok(capno.includes('requestAnimationFrame(draw)'),
  'v2 trace must render smoothly between server snapshots')
assert.ok(capno.includes('v2WaveformPresentationTime({'),
  'visual time must be bounded against authoritative session clock')
assert.ok(capno.includes('while (previous + SAMPLE_INTERVAL <= time'),
  'v2 trace must compute waveform samples continuously at 50 Hz')
assert.ok(capno.includes('nowMs - lastPaintMs >= 50'),
  'v2 trace must repaint at up to 20 FPS, not 1Hz')
assert.ok(capno.includes('if (v2RespiratoryState !== undefined) return'),
  'v2 must keep the local v1 gas-exchange loop disabled')
assert.ok(capno.includes('if (!latest || waveformIsFrozen()) return'),
  'freeze control must stop presentation animation')
assert.ok(!capno.includes('Rebuild the short trace on each canonical tick'),
  'do not regress to one static rebuilt waveform per 1Hz snapshot')
console.log('Session v2 smooth capnogram, pause, speed, stale snapshot and reset regression passed')
