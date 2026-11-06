/**
 * Shared Anaesth v2 session setup and presentation projection.
 * Hosts supply a validated, pinned catalogue; this module performs no I/O,
 * scheduling, authentication or persistence. Projection never advances physiology.
 * Canonical checkpoints remain unprojected and retain schema version 1.
 */
import { createAnaesthSessionAdapter } from './adapters/anaesth.mjs'
import { projectAnaesthV2Monitor, resolveV2ActionNumber } from './adapters/anaesthPilot.mjs'
import { anaesthV2EvaluatorFromLibrary } from './adapters/anaesthLibrary.mjs'
export { publicAnaesthV2Library as projectAnaesthV2SessionLibrary } from './adapters/anaesthLibrary.mjs'

const demoPatient = {
  heartRate: 78, rhythm: 'sinus', systolicPressure: 122, diastolicPressure: 68,
  spo2: 98, peripheralPerfusion: 1, temperatureC: 37,
  respiratory: { respiratoryRate: 12, fio2: 0.21, peepCmH2O: 0 },
  anaestheticGases: { fiSevoPercent: 0 },
}
export const createAnaesthV2SessionAdapter = library => createAnaesthSessionAdapter({ initialPatient: demoPatient,
  applyAction: anaesthV2EvaluatorFromLibrary(library) })
export const projectAnaesthV2SessionSnapshot = snapshot => ({ ...snapshot, runtimes: snapshot.runtimes.map(runtime => ({
  ...runtime, state: { ...runtime.state,
    monitorProjection: runtime.state?.patient && runtime.state?.actionRuntime
      ? projectAnaesthV2Monitor(runtime.state) : null,
    // Read-only pharmacodynamic indicator derived from canonical effects.
    effectIndicators: runtime.state?.actionRuntime ? {
      neuromuscularBlockPercent: Math.round(100 * Math.max(0, Math.min(1,
        resolveV2ActionNumber(runtime.state.actionRuntime, 'neuromuscular.block', 0)))),
    } : null,
  },
})) })
