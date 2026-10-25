import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MonitorPatientState } from './types'
import {
  EDUMON_MONITOR_DISPLAY_ACTION_IDS,
  useEdumonMonitorDisplayDomBridge,
  useMonitorDisplayEnabled,
} from './monitorDisplayActions'
import './edumon-temperature.css'

const DEFAULT_TEMPERATURE_C = 37

function findVisibleFooterHost(): HTMLElement | null {
  const hosts = Array.from(document.querySelectorAll<HTMLElement>('.simulation-console-footer .edumon-control-strip'))
  return hosts.find((host) => {
    const rect = host.getBoundingClientRect()
    const style = window.getComputedStyle(host)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }) ?? null
}

export function EdumonTemperatureSurface({ patientState }: { patientState: MonitorPatientState }) {
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null)
  const temperature = patientState.temperatureC ?? DEFAULT_TEMPERATURE_C
  const temperatureEnabled = useMonitorDisplayEnabled(EDUMON_MONITOR_DISPLAY_ACTION_IDS.temperature)
  useEdumonMonitorDisplayDomBridge()

  useEffect(() => {
    const findHost = () => setFooterHost(findVisibleFooterHost())
    findHost()
    const observer = new MutationObserver(findHost)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', findHost)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', findHost)
    }
  }, [])

  if (!footerHost || !temperatureEnabled) return null

  return createPortal(
    <div className="edumon-temperature-container" aria-label={`Temperature ${temperature.toFixed(1)} degrees Celsius`}>
      <span className="edumon-temperature-title">TEMP</span>
      <strong>{temperature.toFixed(1)}</strong>
      <small>°C</small>
    </div>,
    footerHost,
  )
}
