import type { PhysiologicalMeasurements } from '../physiologyMeasurements'

interface Props {
  open: boolean
  measurements: PhysiologicalMeasurements
  onClose: () => void
}

const value = (number: number | null, digits = 1) => number == null || !Number.isFinite(number) ? '—' : number.toFixed(digits)

function Measurement({ label, valueText, unit }: { label: string; valueText: string; unit: string }) {
  return (
    <div className="physiology-measurement-card">
      <span>{label}</span>
      <strong>{valueText}</strong>
      <small>{unit}</small>
    </div>
  )
}

export function PhysiologyMeasurementsDialog({ open, measurements, onClose }: Props) {
  if (!open) return null

  return (
    <div className="physiology-dialog-backdrop" onMouseDown={onClose}>
      <section className="physiology-dialog" role="dialog" aria-modal="true" aria-label="Physiological measurements" onMouseDown={(event) => event.stopPropagation()}>
        <div className="physiology-dialog-heading">
          <div><span>Simulation-derived</span><h2>Physiological measurements</h2></div>
          <button type="button" onClick={onClose} aria-label="Close measurements">×</button>
        </div>

        <p className="physiology-dialog-note">Values are calculated from the simulated breath history and waveforms. They are not direct copies of the patient settings. A dash means there is not yet enough suitable waveform data for a stable estimate.</p>

        <section className="physiology-section">
          <h3>Ventilation</h3>
          <div className="physiology-grid">
            <Measurement label="Set MinVol" valueText={value(measurements.setMinuteVentilation)} unit="L/min" />
            <Measurement label="Actual MV" valueText={value(measurements.actualMinuteVentilation)} unit="L/min" />
            <Measurement label="Total RR" valueText={value(measurements.totalRespiratoryRate, 0)} unit="/min" />
            <Measurement label="Set RR" valueText={value(measurements.setRespiratoryRate, 0)} unit="/min" />
            <Measurement label="Triggered breaths" valueText={value(measurements.triggeredRespiratoryRate, 0)} unit="/min" />
          </div>
        </section>

        <section className="physiology-section">
          <h3>Respiratory mechanics</h3>
          <div className="physiology-grid">
            <Measurement label="Inspiratory resistance" valueText={value(measurements.inspiratoryResistance)} unit="cmH₂O/L/s" />
            <Measurement label="Expiratory resistance" valueText={value(measurements.expiratoryResistance)} unit="cmH₂O/L/s" />
            <Measurement label="Compliance Insp" valueText={value(measurements.inspiratoryCompliance, 0)} unit="mL/cmH₂O" />
            <Measurement label="Compliance Exp" valueText={value(measurements.expiratoryCompliance, 0)} unit="mL/cmH₂O" />
            <Measurement label="RCi" valueText={value(measurements.inspiratoryTimeConstant, 2)} unit="s" />
            <Measurement label="RCe" valueText={value(measurements.expiratoryTimeConstant, 2)} unit="s" />
          </div>
        </section>

        <section className="physiology-section">
          <h3>Timing</h3>
          <div className="physiology-grid">
            <Measurement label="Inspiratory time" valueText={value(measurements.inspiratoryTime, 2)} unit="s" />
            <Measurement label="Expiratory time" valueText={value(measurements.expiratoryTime, 2)} unit="s" />
          </div>
        </section>
      </section>
    </div>
  )
}
