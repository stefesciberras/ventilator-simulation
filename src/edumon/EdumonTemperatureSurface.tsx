import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MonitorPatientState } from './types'
import './edumon-temperature.css'

const DEFAULT_TEMPERATURE_C = 37

function findVisibleMeasurementHost(): HTMLElement | null {
  const hosts = Array.from(document.querySelectorAll<HTMLElement>('.edumon-monitor-body .edumon-measurements'))
  return hosts.find((host) => {
    const rect = host.getBoundingClientRect()
    const style = window.getComputedStyle(host)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }) ?? null
}

export function EdumonTemperatureSurface({ patientState }: { patientState: MonitorPatientState }) {
  const [measurementHost, setMeasurementHost] = useState<HTMLElement | null>(null)
  const temperature = patientState.temperatureC ?? DEFAULT_TEMPERATURE_C

  useEffect(() => {
    const findHost = () => setMeasurementHost(findVisibleMeasurementHost())
    findHost()
    const observer = new MutationObserver(findHost)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', findHost)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', findHost)
    }
  }, [])

  if (!measurementHost) return null

  return createPortal(
    <div className="edumon-value-panel edumon-value-temperature metric">
      <span className="edumon-value-label">TEMP</span>
      <strong className="edumon-value-main">{temperature.toFixed(1)}</strong>
      <small className="edumon-value-unit">°C</small>
    </div>,
    measurementHost,
  )
}
