import { useEffect, useMemo, useState } from 'react'
import type { PatientSettings, Sample, VentilatorSettings } from '../simulation/types'
import type { PhysiologicalMeasurements } from '../physiologyMeasurements'
import { calculatePredictedBodyWeight } from '../patientMetrics'

type MonitorTab = 'general' | 'co2' | 'oesophageal'

interface Props {
  open: boolean
  measurements: PhysiologicalMeasurements
  samples: Sample[]
  patient: PatientSettings
  ventilator: VentilatorSettings
  peakPressure: number
  expiredTidalVolume: number
  minuteVentilation: number
  peep: number
  meanPressure: number
  autoPeep: number | null
  endTidalCO2: number | null
  measuredIERatio: number | null
  oesophagealEnabled: boolean
  onClose: () => void
}

const display = (number: number | null | undefined, digits = 1) => number == null || !Number.isFinite(number) ? '—' : number.toFixed(digits)

function MonitorMetric({ value, label, unit, digits = 1 }: { value: number | null | undefined; label: string; unit: string; digits?: number }) {
  return (
    <div className="monitor-metric">
      <strong>{display(value, digits)}</strong>
      <div><span>{label}</span><small>{unit}</small></div>
    </div>
  )
}

function latestInspiratoryVolume(samples: Sample[]) {
  let inspirationStartVolume: number | null = null
  let latest: number | null = null
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous.phase === 'expiration' && current.phase === 'inspiration') inspirationStartVolume = previous.volume
    if (previous.phase === 'inspiration' && current.phase === 'expiration' && inspirationStartVolume != null) {
      latest = Math.max(0, previous.volume - inspirationStartVolume)
      inspirationStartVolume = null
    }
  }
  return latest
}

function recentSamples(samples: Sample[], seconds = 20) {
  if (!samples.length) return []
  const latest = samples[samples.length - 1].time
  return samples.filter((sample) => sample.time >= latest - seconds)
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function deriveWaveformMonitorValues(samples: Sample[], peep: number) {
  const recent = recentSamples(samples)
  const inspiratoryFlows = recent.filter((sample) => sample.phase === 'inspiration').map((sample) => sample.flow).filter((flow) => flow > 0)
  const expiratoryFlows = recent.filter((sample) => sample.phase === 'expiration').map((sample) => Math.abs(Math.min(0, sample.flow))).filter((flow) => flow > 0)
  const plateauPressures = recent
    .filter((sample) => sample.phase === 'inspiration' && Math.abs(sample.flow) < 1 && sample.musclePressure < 0.5)
    .map((sample) => sample.pressure)
  const plateauPressure = median(plateauPressures.slice(-80))
  const pesValues = recent.map((sample) => sample.oesophagealPressure).filter(Number.isFinite)
  const pesPlateauValues = recent
    .filter((sample) => sample.phase === 'inspiration' && Math.abs(sample.flow) < 1)
    .map((sample) => sample.oesophagealPressure)
    .filter(Number.isFinite)
  const endExpPesValues = recent
    .filter((sample) => sample.phase === 'expiration' && Math.abs(sample.flow) < 2)
    .map((sample) => sample.oesophagealPressure)
    .filter(Number.isFinite)
  const pesPlateau = median(pesPlateauValues.slice(-80))
  const endExpPes = median(endExpPesValues.slice(-100))

  return {
    inspiratoryFlow: inspiratoryFlows.length ? Math.max(...inspiratoryFlows) : null,
    expiratoryFlow: expiratoryFlows.length ? Math.max(...expiratoryFlows) : null,
    inspiredTidalVolume: latestInspiratoryVolume(recent),
    plateauPressure,
    drivingPressure: plateauPressure == null ? null : plateauPressure - peep,
    pesMax: pesValues.length ? Math.max(...pesValues) : null,
    pesMin: pesValues.length ? Math.min(...pesValues) : null,
    pesPlateau,
    transpulmonaryInspiratory: plateauPressure != null && pesPlateau != null ? plateauPressure - pesPlateau : null,
    transpulmonaryExpiratory: endExpPes != null ? peep - endExpPes : null,
  }
}

export function PhysiologyMeasurementsDialog({ open, measurements, samples, patient, ventilator, peakPressure, expiredTidalVolume, minuteVentilation, peep, meanPressure, autoPeep, endTidalCO2, measuredIERatio, oesophagealEnabled, onClose }: Props) {
  const [tab, setTab] = useState<MonitorTab>('general')
  const derived = useMemo(() => deriveWaveformMonitorValues(samples, peep), [samples, peep])
  const predictedBodyWeight = calculatePredictedBodyWeight(patient.sex ?? 'male', patient.heightCm ?? 170)
  const tidalVolumePerPbw = predictedBodyWeight > 0 ? expiredTidalVolume / predictedBodyWeight : null
  const spontaneousMinuteVentilation = measurements.totalRespiratoryRate > 0
    ? minuteVentilation * Math.min(1, measurements.triggeredRespiratoryRate / measurements.totalRespiratoryRate)
    : 0

  useEffect(() => {
    if (!oesophagealEnabled && tab === 'oesophageal') setTab('general')
  }, [oesophagealEnabled, tab])

  if (!open) return null

  return (
    <div className="physiology-dialog-backdrop" onMouseDown={onClose}>
      <section className="physiology-dialog monitor-dialog" role="dialog" aria-modal="true" aria-label="Physiological measurements" onMouseDown={(event) => event.stopPropagation()}>
        <nav className="monitor-tabs" aria-label="Monitoring categories">
          <button className="monitor-close" type="button" onClick={onClose} aria-label="Close measurements">×</button>
          <button className={tab === 'general' ? 'active' : ''} type="button" onClick={() => setTab('general')}>General</button>
          <button className={tab === 'co2' ? 'active' : ''} type="button" onClick={() => setTab('co2')}>CO₂</button>
          <button className={tab === 'oesophageal' ? 'active' : ''} type="button" disabled={!oesophagealEnabled} title={!oesophagealEnabled ? 'Enable an oesophageal-pressure trace to use this tab' : undefined} onClick={() => setTab('oesophageal')}>Oesophageal</button>
        </nav>

        <div className="monitor-panel">
          {tab === 'general' && (
            <div className="monitor-grid general-monitor-grid">
              <div className="monitor-column">
                <MonitorMetric value={peakPressure} label="Ppeak" unit="cmH₂O" digits={0} />
                <MonitorMetric value={derived.plateauPressure} label="Pplateau" unit="cmH₂O" digits={0} />
                <MonitorMetric value={derived.drivingPressure} label="ΔP" unit="cmH₂O" digits={0} />
                <MonitorMetric value={meanPressure} label="Pmean" unit="cmH₂O" digits={1} />
                <MonitorMetric value={peep} label="PEEP/CPAP" unit="cmH₂O" digits={1} />
                <MonitorMetric value={autoPeep} label="AutoPEEP" unit="cmH₂O" digits={1} />
              </div>
              <div className="monitor-column">
                <MonitorMetric value={derived.inspiratoryFlow} label="Insp Flow" unit="L/min" digits={1} />
                <MonitorMetric value={derived.expiratoryFlow} label="Exp Flow" unit="L/min" digits={1} />
                <MonitorMetric value={derived.inspiredTidalVolume} label="VTI" unit="mL" digits={0} />
                <MonitorMetric value={expiredTidalVolume} label="VTE" unit="mL" digits={0} />
                <MonitorMetric value={minuteVentilation} label="ExpMinVol" unit="L/min" digits={1} />
                <MonitorMetric value={spontaneousMinuteVentilation} label="MVSpont" unit="L/min" digits={2} />
              </div>
              <div className="monitor-column">
                <MonitorMetric value={measurements.totalRespiratoryRate} label="fTotal" unit="b/min" digits={0} />
                <MonitorMetric value={measurements.triggeredRespiratoryRate} label="fSpont" unit="b/min" digits={0} />
                <MonitorMetric value={measurements.inspiratoryTime} label="TI" unit="s" digits={2} />
                <MonitorMetric value={measurements.expiratoryTime} label="TE" unit="s" digits={2} />
                <div className="monitor-metric"><strong>{measuredIERatio == null ? '—' : `1:${measuredIERatio.toFixed(2)}`}</strong><div><span>I:E</span><small></small></div></div>
                <MonitorMetric value={tidalVolumePerPbw} label="Vt/PBW" unit="mL/kg" digits={1} />
              </div>
              <div className="monitor-column">
                <MonitorMetric value={measurements.inspiratoryResistance} label="Rinsp" unit="cmH₂O/L/s" digits={1} />
                <MonitorMetric value={measurements.expiratoryResistance} label="Rexp" unit="cmH₂O/L/s" digits={1} />
                <MonitorMetric value={measurements.inspiratoryCompliance} label="Cstat" unit="mL/cmH₂O" digits={1} />
                <MonitorMetric value={measurements.inspiratoryTimeConstant} label="RCinsp" unit="s" digits={2} />
                <MonitorMetric value={measurements.expiratoryTimeConstant} label="RCexp" unit="s" digits={2} />
                <MonitorMetric value={ventilator.fio2 * 100} label="Oxygen" unit="%" digits={0} />
              </div>
            </div>
          )}

          {tab === 'co2' && <div className="monitor-grid monitor-grid-sparse"><div className="monitor-column"><MonitorMetric value={endTidalCO2} label="EtCO₂" unit="mmHg" digits={0} /></div></div>}

          {tab === 'oesophageal' && oesophagealEnabled && (
            <div className="monitor-grid monitor-grid-sparse oesophageal-monitor-grid">
              <div className="monitor-column">
                <MonitorMetric value={derived.pesMax} label="Pes max" unit="cmH₂O" digits={1} />
                <MonitorMetric value={derived.pesPlateau} label="Pes plateau" unit="cmH₂O" digits={1} />
                <MonitorMetric value={derived.pesMin} label="Pes min" unit="cmH₂O" digits={1} />
                <MonitorMetric value={null} label="Pes P0.1" unit="cmH₂O" />
                <MonitorMetric value={null} label="Pes PTP" unit="cmH₂O·s" />
              </div>
              <div className="monitor-column">
                <MonitorMetric value={derived.transpulmonaryInspiratory} label="Ptrans I" unit="cmH₂O" digits={1} />
                <MonitorMetric value={derived.transpulmonaryExpiratory} label="Ptrans E" unit="cmH₂O" digits={1} />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
