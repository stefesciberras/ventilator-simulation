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

function MeasurementRow({ label, children, columns = 2 }: { label: string; children: React.ReactNode; columns?: 2 | 3 }) {
  return (
    <section className="physiology-row-group">
      <h3>{label}</h3>
      <div className={`physiology-row columns-${columns}`}>{children}</div>
    </section>
  )
}

export function PhysiologyMeasurementsDialog({ open, measurements, onClose }: Props) {
  if (!open) return null

  return (
    <div className="physiology-dialog-backdrop" onMouseDown={onClose}>
      <section className="physiology-dialog physiology-dialog-compact" role="dialog" aria-modal="true" aria-label="Physiological measurements" onMouseDown={(event) => event.stopPropagation()}>
        <button className="physiology-dialog-close" type="button" onClick={onClose} aria-label="Close measurements">×</button>

        <MeasurementRow label="Minute ventilation">
          <Measurement label="Set MinVol" valueText={value(measurements.setMinuteVentilation)} unit="L/min" />
          <Measurement label="Actual MV" valueText={value(measurements.actualMinuteVentilation)} unit="L/min" />
        </MeasurementRow>

        <MeasurementRow label="Respiratory rate" columns={3}>
          <Measurement label="Total RR" valueText={value(measurements.totalRespiratoryRate, 0)} unit="/min" />
          <Measurement label="Set RR" valueText={value(measurements.setRespiratoryRate, 0)} unit="/min" />
          <Measurement label="Triggered RR" valueText={value(measurements.triggeredRespiratoryRate, 0)} unit="/min" />
        </MeasurementRow>

        <MeasurementRow label="Compliance">
          <Measurement label="Inspiratory" valueText={value(measurements.inspiratoryCompliance, 0)} unit="mL/cmH₂O" />
          <Measurement label="Expiratory" valueText={value(measurements.expiratoryCompliance, 0)} unit="mL/cmH₂O" />
        </MeasurementRow>

        <MeasurementRow label="Resistance">
          <Measurement label="Inspiratory" valueText={value(measurements.inspiratoryResistance)} unit="cmH₂O/L/s" />
          <Measurement label="Expiratory" valueText={value(measurements.expiratoryResistance)} unit="cmH₂O/L/s" />
        </MeasurementRow>

        <MeasurementRow label="Time constants">
          <Measurement label="RCi" valueText={value(measurements.inspiratoryTimeConstant, 2)} unit="s" />
          <Measurement label="RCe" valueText={value(measurements.expiratoryTimeConstant, 2)} unit="s" />
        </MeasurementRow>

        <MeasurementRow label="Timing">
          <Measurement label="Inspiratory time" valueText={value(measurements.inspiratoryTime, 2)} unit="s" />
          <Measurement label="Expiratory time" valueText={value(measurements.expiratoryTime, 2)} unit="s" />
        </MeasurementRow>
      </section>
    </div>
  )
}
