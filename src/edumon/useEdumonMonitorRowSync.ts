import { useEffect } from 'react'
import './edumon-monitor-row-sync.css'

type RowPair = {
  traceSelector: string
  valueSelector: string
}

const ROW_PAIRS: RowPair[] = [
  { traceSelector: '.edumon-trace-ecg', valueSelector: '.edumon-value-ecg' },
  { traceSelector: '.edumon-trace-art', valueSelector: '.edumon-value-art' },
  { traceSelector: '.edumon-trace-spo2', valueSelector: '.edumon-value-spo2' },
  { traceSelector: '.edumon-trace-capnography', valueSelector: '.edumon-value-capnography' },
  { traceSelector: '.edumon-trace-bis', valueSelector: '.edumon-value-bis' },
]

function visibleElement<T extends HTMLElement>(root: ParentNode, selector: string): T | null {
  const candidates = Array.from(root.querySelectorAll<T>(selector))
  return candidates.find((candidate) => {
    if (!candidate.isConnected) return false
    const style = window.getComputedStyle(candidate)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = candidate.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) ?? null
}

export function useEdumonMonitorRowSync(): void {
  useEffect(() => {
    let frame = 0
    let resizeObserver: ResizeObserver | null = null
    let observedElements = new Set<Element>()

    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sync)
    }

    const observe = (element: Element | null) => {
      if (!element || observedElements.has(element) || !resizeObserver) return
      resizeObserver.observe(element)
      observedElements.add(element)
    }

    const sync = () => {
      frame = 0
      const body = visibleElement<HTMLElement>(document, '.edumon-monitor-body')
      if (!body) return

      const waveformHost = visibleElement<HTMLElement>(body, '.edumon-waveform-area')
      const measurementHost = visibleElement<HTMLElement>(body, '.edumon-measurements')
      if (!waveformHost || !measurementHost) return

      measurementHost.classList.add('edumon-measurements-row-synced')
      observe(body)
      observe(waveformHost)
      observe(measurementHost)

      for (const pair of ROW_PAIRS) {
        const trace = visibleElement<HTMLElement>(waveformHost, pair.traceSelector)
        const value = measurementHost.querySelector<HTMLElement>(pair.valueSelector)
        if (!value) continue

        if (!trace || window.getComputedStyle(value).display === 'none') {
          value.style.removeProperty('--edumon-matched-row-height')
          continue
        }

        observe(trace)
        observe(value)
        const height = trace.getBoundingClientRect().height
        if (height > 0) value.style.setProperty('--edumon-matched-row-height', `${height}px`)
      }
    }

    resizeObserver = new ResizeObserver(scheduleSync)
    const mutationObserver = new MutationObserver(scheduleSync)
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-edumon-monitor-inv-bp'],
    })
    window.addEventListener('resize', scheduleSync)
    scheduleSync()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleSync)
      for (const host of document.querySelectorAll<HTMLElement>('.edumon-measurements-row-synced')) {
        host.classList.remove('edumon-measurements-row-synced')
      }
      for (const pair of ROW_PAIRS) {
        for (const value of document.querySelectorAll<HTMLElement>(pair.valueSelector)) {
          value.style.removeProperty('--edumon-matched-row-height')
        }
      }
      observedElements = new Set<Element>()
    }
  }, [])
}
