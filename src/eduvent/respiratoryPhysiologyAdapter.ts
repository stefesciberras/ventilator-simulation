import { calculateEffectiveDeadSpace } from '../patientMetrics'
import {
  stepRespiratoryPhysiology,
  type RespiratoryPhysiologyInput,
  type RespiratoryPhysiologyOutput,
  type RespiratoryPhysiologyState,
} from '../core/physiology/respiratory'
import type { PatientSettings, VentilatorSettings } from '../simulation/types'

export interface EduventRespiratoryTelemetry {
  respiratoryRate: number
  expiredTidalVolumeL: number
}

export function eduventRespiratoryInput(
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  telemetry: EduventRespiratoryTelemetry,
): RespiratoryPhysiologyInput {
  const fallbackTidalVolumeMl = Math.max(ventilator.tidalVolume, 300)
  const tidalVolumeMl = telemetry.expiredTidalVolumeL > 0.02
    ? telemetry.expiredTidalVolumeL * 1000
    : fallbackTidalVolumeMl
  const effectiveDeadSpace = calculateEffectiveDeadSpace(patient, tidalVolumeMl)

  return {
    sex: patient.sex,
    heightCm: patient.heightCm ?? 170,
    respiratoryRate: telemetry.respiratoryRate,
    tidalVolumeMl,
    deadSpaceMl: effectiveDeadSpace.deadSpaceMl,
    fio2: ventilator.fio2,
    peepCmH2O: ventilator.peep,
    complianceMlPerCmH2O: patient.compliance,
    expiratoryResistanceCmH2OLs: patient.expiratoryResistance,
    frcMl: patient.frc ?? 2500,
    shuntFraction: patient.shuntFraction ?? 0.03,
    maxSpO2: patient.maxSpO2 ?? 100,
    oxygenConsumptionMlMin: patient.oxygenConsumption ?? 250,
    co2ProductionMlMin: patient.co2Production ?? 250,
    referenceCardiacOutputLMin: 5,
  }
}

export function stepEduventRespiratoryPhysiology(
  previousState: RespiratoryPhysiologyState,
  ventilator: VentilatorSettings,
  patient: PatientSettings,
  telemetry: EduventRespiratoryTelemetry,
  deltaTimeSeconds: number,
): { state: RespiratoryPhysiologyState; output: RespiratoryPhysiologyOutput } {
  return stepRespiratoryPhysiology(
    previousState,
    eduventRespiratoryInput(ventilator, patient, telemetry),
    deltaTimeSeconds,
  )
}
