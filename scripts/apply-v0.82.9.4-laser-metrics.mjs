import fs from 'node:fs'

function edit(path, changes) {
  let text = fs.readFileSync(path, 'utf8')
  for (const { from, to, label } of changes) {
    if (!text.includes(from)) throw new Error(`${path}: missing ${label}`)
    text = text.replace(from, to)
  }
  fs.writeFileSync(path, text)
}

edit('src/teaching/TeachingLaserPointer.tsx', [
  {
    label: 'metric snapshot type',
    from: "interface TeachingWaveformCardSnapshot {\n  label: string\n  unit: string\n  image: string\n}\n\ninterface TeachingWaveformSnapshot {",
    to: "interface TeachingWaveformCardSnapshot {\n  label: string\n  unit: string\n  image: string\n}\n\ninterface TeachingMetricSnapshot {\n  label: string\n  value: string\n  unit: string\n  className: string\n}\n\ninterface TeachingWaveformSnapshot {",
  },
  {
    label: 'snapshot metrics field',
    from: "  clockText: string | null\n  cards: TeachingWaveformCardSnapshot[]\n}",
    to: "  clockText: string | null\n  cards: TeachingWaveformCardSnapshot[]\n  metrics: TeachingMetricSnapshot[]\n}",
  },
  {
    label: 'snapshot validation metrics',
    from: "    && candidate.cards.every((card) => Boolean(card)\n      && typeof card === 'object'\n      && typeof (card as TeachingWaveformCardSnapshot).label === 'string'\n      && typeof (card as TeachingWaveformCardSnapshot).unit === 'string'\n      && typeof (card as TeachingWaveformCardSnapshot).image === 'string')",
    to: "    && candidate.cards.every((card) => Boolean(card)\n      && typeof card === 'object'\n      && typeof (card as TeachingWaveformCardSnapshot).label === 'string'\n      && typeof (card as TeachingWaveformCardSnapshot).unit === 'string'\n      && typeof (card as TeachingWaveformCardSnapshot).image === 'string')\n    && Array.isArray(candidate.metrics)\n    && candidate.metrics.every((metric) => Boolean(metric)\n      && typeof metric === 'object'\n      && typeof (metric as TeachingMetricSnapshot).label === 'string'\n      && typeof (metric as TeachingMetricSnapshot).value === 'string'\n      && typeof (metric as TeachingMetricSnapshot).unit === 'string'\n      && typeof (metric as TeachingMetricSnapshot).className === 'string')",
  },
  {
    label: 'capture metrics',
    from: "  if (!cards.length) return null\n  return {\n    frameId: crypto.randomUUID(),\n    capturedAt: Date.now(),\n    clockText: readVisibleClockText(),\n    cards,\n  }",
    to: "  if (!cards.length) return null\n\n  const metricsPanel = surface.parentElement?.querySelector<HTMLElement>('.metrics-panel')\n  const metrics: TeachingMetricSnapshot[] = []\n  if (metricsPanel) {\n    for (const metric of Array.from(metricsPanel.querySelectorAll<HTMLElement>(':scope > .metric:not(.gas-metric)'))) {\n      metrics.push({\n        label: metric.querySelector<HTMLElement>(':scope > span')?.textContent?.trim() || '',\n        value: metric.querySelector<HTMLElement>(':scope > strong')?.textContent?.trim() || '—',\n        unit: metric.querySelector<HTMLElement>(':scope > small')?.textContent?.trim() || '',\n        className: metric.className,\n      })\n    }\n    for (const metric of Array.from(metricsPanel.querySelectorAll<HTMLElement>('.gas-metric-item'))) {\n      metrics.push({\n        label: metric.querySelector<HTMLElement>(':scope > span')?.textContent?.trim() || '',\n        value: metric.querySelector<HTMLElement>('strong')?.textContent?.trim() || '—',\n        unit: metric.querySelector<HTMLElement>('small')?.textContent?.trim() || '',\n        className: metric.className,\n      })\n    }\n  }\n\n  return {\n    frameId: crypto.randomUUID(),\n    capturedAt: Date.now(),\n    clockText: readVisibleClockText(),\n    cards,\n    metrics,\n  }",
  },
  {
    label: 'metrics frame position',
    from: "  const visible = Boolean(displayed?.active) && (role === 'candidate' || enabled)\n",
    to: "  const sharedMetricsPosition = (() => {\n    const surface = surfaceRef.current\n    if (!surface || !sharedSnapshot || !sharedSnapshot.metrics.length) return null\n    const surfaceRect = surface.getBoundingClientRect()\n    const rect = regionRectFor(surface, 'metrics')\n    return {\n      left: `${rect.left - surfaceRect.left}px`,\n      top: `${rect.top - surfaceRect.top}px`,\n      width: `${rect.width}px`,\n      height: `${rect.height}px`,\n    }\n  })()\n  const visible = Boolean(displayed?.active) && (role === 'candidate' || enabled)\n",
  },
  {
    label: 'metrics frame render',
    from: "        {isController && enabled && onEnabledChange && (",
    to: "        {sharedSnapshot && sharedMetricsPosition && (\n          <div className=\"teaching-shared-metrics-frame\" style={sharedMetricsPosition}>\n            <span className=\"teaching-shared-metrics-badge\">Instructor measured values</span>\n            <div className=\"teaching-shared-metrics-list\">\n              {sharedSnapshot.metrics.map((metric, index) => (\n                <div key={`${sharedSnapshot.frameId}-metric-${index}`} className={`teaching-shared-metric ${metric.className.includes('metric-alarm-red') ? 'alarm-red' : metric.className.includes('metric-alarm-yellow') ? 'alarm-yellow' : ''}`}>\n                  <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.unit}</small>\n                </div>\n              ))}\n            </div>\n          </div>\n        )}\n        {isController && enabled && onEnabledChange && (",
  },
])

const cssPath = 'src/teaching/TeachingSharedWaveform.css'
let css = fs.readFileSync(cssPath, 'utf8')
if (!css.includes('.teaching-shared-metrics-frame')) {
  css += `\n\n/* Frozen instructor measurements paired with the shared teaching waveform. */\n.teaching-shared-metrics-frame {\n  position:absolute;\n  z-index:2;\n  box-sizing:border-box;\n  overflow:hidden;\n  padding:28px 8px 8px;\n  border:1px solid rgba(239,138,39,.48);\n  border-radius:8px;\n  background:#071015;\n  box-shadow:inset 0 0 0 1px rgba(255,255,255,.025),0 8px 24px rgba(0,0,0,.28);\n  pointer-events:none;\n}\n.teaching-shared-metrics-badge {\n  position:absolute; top:6px; left:8px; right:8px;\n  overflow:hidden; white-space:nowrap; text-overflow:ellipsis;\n  color:#ffc47f; font-size:.58rem; font-weight:800; letter-spacing:.05em; text-transform:uppercase;\n}\n.teaching-shared-metrics-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; align-content:start; height:100%; }\n.teaching-shared-metric { min-width:0; display:grid; grid-template-columns:1fr auto; grid-template-areas:'label value' 'unit unit'; align-items:baseline; gap:1px 5px; padding:5px 6px; border-radius:5px; background:#0e1c22; color:#eef5f7; }\n.teaching-shared-metric span { grid-area:label; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#95aab3; font-size:.61rem; }\n.teaching-shared-metric strong { grid-area:value; font-size:.84rem; line-height:1; }\n.teaching-shared-metric small { grid-area:unit; color:#78909a; font-size:.55rem; }\n.teaching-shared-metric.alarm-yellow { box-shadow:inset 3px 0 #f4c542; }\n.teaching-shared-metric.alarm-red { box-shadow:inset 3px 0 #ef5a55; }\n`
  fs.writeFileSync(cssPath, css)
}

console.log('Applied shared laser measured-value snapshot')
