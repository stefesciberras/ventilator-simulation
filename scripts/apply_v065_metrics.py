from pathlib import Path

app = Path('src/App.tsx')
text = app.read_text()
metric_anchor = '''function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>
}
'''
metric_replacement = metric_anchor + '''
function GasMetric({ etco2, spo2 }: { etco2: string; spo2: string }) {
  return (
    <div className="metric gas-metric" aria-label={`EtCO₂ ${etco2} millimetres of mercury, SpO₂ ${spo2} percent`}>
      <div className="gas-metric-item co2">
        <span>EtCO₂</span>
        <div><strong>{etco2}</strong><small>mmHg</small></div>
      </div>
      <div className="gas-metric-item spo2">
        <span>SpO₂</span>
        <div><strong>{spo2}</strong><small>%</small></div>
      </div>
    </div>
  )
}
'''
if metric_anchor not in text:
    raise SystemExit('Metric anchor not found')
text = text.replace(metric_anchor, metric_replacement, 1)
old = '''              <div className="metrics-spacer" aria-hidden="true" />
              <Metric label="SpO₂" value={latestSample?.spo2 == null ? '—' : latestSample.spo2.toFixed(0)} unit="%" />
              <Metric label="EtCO₂" value={endTidalCO2 == null ? '—' : endTidalCO2.toFixed(0)} unit="mmHg" />
'''
new = '''              <div className="metrics-spacer" aria-hidden="true" />
              <GasMetric
                etco2={endTidalCO2 == null ? '—' : endTidalCO2.toFixed(0)}
                spo2={latestSample?.spo2 == null ? '—' : latestSample.spo2.toFixed(0)}
              />
'''
if old not in text:
    raise SystemExit('Gas metrics block not found')
text = text.replace(old, new, 1)
text = text.replace("appVersion: '0.64'", "appVersion: '0.65'")
text = text.replace('<span className="version">v0.64</span>', '<span className="version">v0.65</span>')
app.write_text(text)

styles = Path('src/styles.css')
css = styles.read_text()
anchor = '''.metric small { margin-left: 4px; font-size: 8px; color: #768891; }
'''
addition = anchor + '''.gas-metric { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); padding: 0; text-align: center; }
.gas-metric-item { min-width: 0; padding: 11px 5px; }
.gas-metric-item + .gas-metric-item { border-left: 1px solid #26343c; }
.gas-metric-item > div { display: flex; justify-content: center; align-items: baseline; gap: 3px; white-space: nowrap; }
.gas-metric-item span { letter-spacing: .06em; }
.gas-metric-item small { margin-left: 0; }
.gas-metric-item.co2 span, .gas-metric-item.co2 strong, .gas-metric-item.co2 small { color: #f6df63; }
.gas-metric-item.spo2 span, .gas-metric-item.spo2 strong, .gas-metric-item.spo2 small { color: #69d8f1; }
'''
if anchor not in css:
    raise SystemExit('Metric CSS anchor not found')
css = css.replace(anchor, addition, 1)
styles.write_text(css)

for path in ['src/components/SessionPanel.tsx', 'src/components/InstructorAccountControls.tsx']:
    p = Path(path)
    t = p.read_text().replace('v0.64', 'v0.65')
    p.write_text(t)
