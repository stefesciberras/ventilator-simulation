import { useEffect, useState } from 'react'
import type { PhysiologicalMeasurements } from '../physiologyMeasurements'

type MonitorTab = 'general' | 'spo2' | 'co2' | 'oesophageal'

interface Props {
  open: boolean
  measurements: PhysiologicalMeasurements
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

function oesophagealTraceIsInUse() {
  if (typeof document === 'undefined') return false
  return Array.from(document.querySelectorAll<HTMLSelectElement>('.waveform-options-bar select'))
    .some((select) => select.value === 'oesophagealPressure')
}

export function PhysiologyMeasurementsDialog({ open, measurements, onClose }: Props) {
  const [tab, setTab] = useState<MonitorTab>('general')
  const oesophagealEnabled = open ? oesophagealTraceIsInUse() : false
  const spontaneousMinuteVentilation = measurements.totalRespiratoryRate > 0
    ? measurements.actualMinuteVentilation * Math.min(1, measurements.triggeredRespiratoryRate / measurements.totalRespiratoryRate)
    : 0
  const measuredIERatio = measurements.inspiratoryTime != null && measurements.expiratoryTime != null && measurements.inspiratoryTime > 0
    ? measurements.expiratoryTime / measurements.inspiratoryTime
    : null

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
          <button className={tab === 'spo2' ? 'active' : ''} type="button" onClick={() => setTab('spo2')}>SpO₂</button>
          <button className={tab === 'co2' ? 'active' : ''} type="button" onClick={() => setTab('co2')}>CO₂</button>
          <button className={tab === 'oesophageal' ? 'active' : ''} type="button" disabled={!oesophagealEnabled} title={!oesophagealEnabled ? 'Enable an oesophageal-pressure trace to use this tab' : undefined} onClick={() => setTab('oesophageal')}>Oesophageal</button>
        </nav>

        <div className="monitor-panel">
          {tab === 'general' && (
            <div className="monitor-grid general-monitor-grid">
              <div className="monitor-column">
                <MonitorMetric value={measurements.peakPressure} label="Ppeak" unit="cmH₂O" digits={0} />
                <MonitorMetric value={measurements.plateauPressure} label="Pplateau" unit="cmH₂O" digits={0} />
                <MonitorMetric value={measurements.drivingPressure} label="ΔP" unit="cmH₂O" digits={0} />
                <MonitorMetric value={measurements.meanPressure} label="Pmean" unit="cmH₂O" digits={1} />
                <MonitorMetric value={measurements.measuredPeep} label="PEEP/CPAP" unit="cmH₂O" digits={1} />
                <MonitorMetric value={measurements.autoPeep} label="AutoPEEP" unit="cmH₂O" digits={1} />
              </div>

              <div className="monitor-column">
                <MonitorMetric value={measurements.inspiratoryFlow} label="Insp Flow" unit="L/min" digits={1} />
                <MonitorMetric value={measurements.expiratoryFlow} label="Exp Flow" unit="L/min" digits={1} />
                <MonitorMetric value={measurements.inspiredTidalVolume} label="VTI" unit="mL" digits={0} />
                <MonitorMetric value={measurements.expiredTidalVolume} label="VTE" unit="mL" digits={0} />
                <MonitorMetric value={measurements.actualMinuteVentilation} label="ExpMinVol" unit="L/min" digits={1} />
                <MonitorMetric value={spontaneousMinuteVentilation} label="MVSpont" unit="L/min" digits={2} />
              </div>

              <div className="monitor-column">
                <MonitorMetric value={measurements.totalRespiratoryRate} label="fTotal" unit="b/min" digits={0} />
                <MonitorMetric value={measurements.triggeredRespiratoryRate} label="fSpont" unit="b/min" digits={0} />
                <MonitorMetric value={measurements.inspiratoryTime} label="TI" unit="s" digits={2} />
                <MonitorMetric value={measurements.expiratoryTime} label="TE" unit="s" digits={2} />
                <div className="monitor-metric">
                  <strong>{measuredIERatio == null ? '—' : `1:${measuredIERatio.toFixed(2)}`}</strong>
                  <div><span>I:E</span><small></small></div>
                </div>
                <MonitorMetric value={measurements.setMinuteVentilation} label="Set MinVol" unit="L/min" digits={1} />
              </div>

              <div className="monitor-column">
                <MonitorMetric value={measurements.inspiratoryResistance} label="Rinsp" unit="cmH₂O/L/s" digits={1} />
                <MonitorMetric value={measurements.expiratoryResistance} label="Rexp" unit="cmH₂O/L/s" digits={1} />
                <MonitorMetric value={measurements.inspiratoryCompliance} label="Cstat" unit="mL/cmH₂O" digits={1} />
                <MonitorMetric value={measurements.inspiratoryTimeConstant} label="RCinsp" unit="s" digits={2} />
                <MonitorMetric value={measurements.expiratoryTimeConstant} label="RCexp" unit="s" digits={2} />
                <MonitorMetric value={measurements.oxygenPercent} label="Oxygen" unit="%" digits={0} />
              </div>
            </div>
          )}

          {tab === 'co2' && (
            <div className="monitor-grid monitor-grid-sparse">
              <div className="monitor-column">
                <MonitorMetric value={measurements.endTidalCO2} label="EtCO₂" unit="mmHg" digits={0} />
              </div>
            </div>
          )}

          {tab === 'oesophageal' && oesophagealEnabled && (
            <div className="monitor-grid monitor-grid-sparse oesophageal-monitor-grid">
              <div className="monitor-column">
                <MonitorMetric value={measurements.pesMax} label="Pes max" unit="cmH₂O" digits={1} />
                <MonitorMetric value={measurements.pesPlateau} label="Pes plateau" unit="cmH₂O" digits={1} />
                <MonitorMetric value={measurements.pesMin} label="Pes min" unit="cmH₂O" digits={1} />
                <MonitorMetric value={null} label="Pes P0.1" unit="cmH₂O" />
                <MonitorMetric value={null} label="Pes PTP" unit="cmH₂O·s" />
              </div>
              <div className="monitor-column">
                <MonitorMetric value={measurements.transpulmonaryInspiratory} label="Ptrans I" unit="cmH₂O" digits={1} />
                <MonitorMetric value={measurements.transpulmonaryExpiratory} label="Ptrans E" unit="cmH₂O" digits={1} />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
