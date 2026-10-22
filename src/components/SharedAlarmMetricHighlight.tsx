import { useEffect } from 'react'

export type SharedAlarmMetricHighlightLevel = 'yellow' | 'red'

export interface SharedAlarmMetricHighlightRule {
  selector: string
  yellowLabels?: readonly string[]
  redLabels?: readonly string[]
}

function normaliseAlarmText(value: string) {
  return value.toUpperCase().replaceAll('₂', '2')
}

function labelMatches(alarmText: string, labels: readonly string[] | undefined) {
  return Boolean(labels?.some((label) => alarmText.includes(normaliseAlarmText(label))))
}

function existingEduventLevel(element: Element): SharedAlarmMetricHighlightLevel | null {
  if (element.classList.contains('metric-alarm-red')) return 'red'
  if (element.classList.contains('metric-alarm-yellow')) return 'yellow'
  return null
}

export function SharedAlarmMetricHighlight({ rules = [] }: { rules?: readonly SharedAlarmMetricHighlightRule[] }) {
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return

    let animationFrame = 0

    const applyHighlights = () => {
      animationFrame = 0
      const desired = new Map<Element, SharedAlarmMetricHighlightLevel>()

      // EDUVENT already computes alarm state per metric. Promote those product
      // classes into the shared EDUSIM presentation layer so both products use
      // the same visual treatment from this point onward.
      root.querySelectorAll('.metric-alarm-yellow, .metric-alarm-red').forEach((element) => {
        const level = existingEduventLevel(element)
        if (level) desired.set(element, level)
      })

      // Products whose alarm controller exposes aggregate banner labels can
      // register label-to-metric rules without duplicating highlight styling.
      const alarmText = normaliseAlarmText(
        Array.from(root.querySelectorAll('.alarm-banner strong'))
          .map((element) => element.textContent ?? '')
          .join(' • '),
      )

      for (const rule of rules) {
        const level: SharedAlarmMetricHighlightLevel | null = labelMatches(alarmText, rule.redLabels)
          ? 'red'
          : labelMatches(alarmText, rule.yellowLabels)
            ? 'yellow'
            : null
        if (!level) continue
        root.querySelectorAll(rule.selector).forEach((element) => desired.set(element, level))
      }

      root.querySelectorAll('[data-edusim-alarm-highlight="managed"]').forEach((element) => {
        if (desired.has(element)) return
        element.removeAttribute('data-edusim-alarm-highlight')
        element.classList.remove('edusim-alarm-value-active', 'edusim-alarm-value-yellow', 'edusim-alarm-value-red')
      })

      desired.forEach((level, element) => {
        const levelClass = `edusim-alarm-value-${level}`
        const oppositeClass = level === 'red' ? 'edusim-alarm-value-yellow' : 'edusim-alarm-value-red'
        if (element.getAttribute('data-edusim-alarm-highlight') !== 'managed') {
          element.setAttribute('data-edusim-alarm-highlight', 'managed')
        }
        element.classList.add('edusim-alarm-value-active', levelClass)
        element.classList.remove(oppositeClass)
      })
    }

    const scheduleApply = () => {
      if (animationFrame) return
      animationFrame = requestAnimationFrame(applyHighlights)
    }

    const observer = new MutationObserver(scheduleApply)
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    })

    applyHighlights()
    return () => {
      observer.disconnect()
      if (animationFrame) cancelAnimationFrame(animationFrame)
    }
  }, [rules])

  return null
}
