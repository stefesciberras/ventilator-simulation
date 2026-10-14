from pathlib import Path

p=Path('src/App.tsx')
s=p.read_text()
old="  const [instructorSimulatorExpanded, setInstructorSimulatorExpanded] = useState(false)\n"
assert old in s
s=s.replace(old, old+"  const [controlTab, setControlTab] = useState<'teaching' | 'vent' | 'patient' | 'physio'>('teaching')\n",1)
old='        <aside className="control-panel">\n'
new='''        <aside className={`control-panel control-tab-${controlTab}`}>
          <nav className="control-tabs" aria-label="Control sections">
            {(['teaching', 'vent', 'patient', 'physio'] as const).map((tab) => (
              <button key={tab} type="button" className={controlTab === tab ? 'selected' : ''} onClick={() => setControlTab(tab)}>
                {tab === 'teaching' ? 'Teaching' : tab === 'vent' ? 'Vent' : tab === 'patient' ? 'Patient' : 'Physio'}
              </button>
            ))}
          </nav>
'''
assert old in s
s=s.replace(old,new,1)
p.write_text(s)

p=Path('src/appVersion.ts')
p.write_text(p.read_text().replace('0.80.2','0.80.3'))

p=Path('src/styles.css')
s=p.read_text()
s += '''\n\n/* v0.80.3 tabbed control sections */\n.control-tabs { position: sticky; top: 0; z-index: 20; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 5px; margin: -15px -15px 12px; padding: 8px; border-bottom: 1px solid #2b3a43; background: rgba(12,19,24,.96); backdrop-filter: blur(8px); }\n.control-tabs button { min-width: 0; padding: 8px 6px; font-size: 10px; font-weight: 800; letter-spacing: .04em; }\n.control-tabs button.selected { color: #dff7ff; border-color: #68bddc; background: #193744; }\n.control-panel.control-tab-teaching > .ventilator-settings-fieldset, .control-panel.control-tab-teaching > .patient-settings-fieldset { display:none; }\n.control-panel.control-tab-vent > .session-panel, .control-panel.control-tab-vent > .patient-settings-fieldset, .control-panel.control-tab-vent > .instructor-live-room { display:none; }\n.control-panel.control-tab-patient > .session-panel, .control-panel.control-tab-patient > .ventilator-settings-fieldset, .control-panel.control-tab-patient > .instructor-live-room { display:none; }\n.control-panel.control-tab-physio > .session-panel, .control-panel.control-tab-physio > .ventilator-settings-fieldset, .control-panel.control-tab-physio > .instructor-live-room { display:none; }\n.control-panel.control-tab-patient .patient-physiology-column { display:none !important; }\n.control-panel.control-tab-physio .patient-respiratory-controls { display:none !important; }\n.control-panel.control-tab-physio .patient-section > .control-section-title { display:none !important; }\n.control-panel.control-tab-patient .patient-section, .control-panel.control-tab-physio .patient-section { margin-top:0; }\n@media (max-width:680px){ .control-tabs{margin:-15px -15px 10px;gap:3px;padding:6px}.control-tabs button{padding:7px 3px;font-size:9px}.control-panel.control-tab-teaching>.candidate-session-panel{display:none} }\n'''
p.write_text(s)

p=Path('src/mobile-metrics.css')
s=p.read_text()
s += '''\n\n/* v0.80.3 compact mobile monitoring rail */\n@media (max-width:680px){\n.screen-body{grid-template-columns:minmax(0,1fr) 118px}\n.waveforms{padding-left:7px;padding-right:7px}\n.waveforms.four-traces .waveform-card{height:132px}\n.metrics-panel{position:relative;display:flex;flex-direction:column;min-width:0;padding-top:34px;border-top:0;border-left:1px solid #253139}\n.metrics-title{display:none}\n.metrics-actions{position:absolute;top:0;right:0;z-index:7;width:82px;height:34px;display:block;padding:3px;border:0;background:#10181d}\n.metrics-actions button{width:100%;min-height:28px;height:28px;padding:3px 4px;font-size:8px;white-space:nowrap}\n.waveforms .alarm-banner{position:relative;z-index:6;width:calc(100% + 118px - 82px);min-height:34px;padding:6px 9px;margin-right:calc(-118px + 82px);font-size:10px}\n.metrics-panel>.metric:not(.gas-metric){flex:1 1 0;min-height:0;display:flex;align-items:center;gap:4px;padding:4px 6px;text-align:right}\n.metric>span{flex:1 1 auto;display:block;min-width:0;text-align:left;font-size:8px;letter-spacing:.03em}\n.metric>strong{flex:0 0 auto;margin:0;font-size:17px;line-height:1}\n.metric>small{flex:0 0 auto;display:block;margin:0;max-width:34px;font-size:6.5px;line-height:1.05;text-align:left}\n.metrics-spacer{flex:0 0 4px;min-height:4px}\n.gas-metric{flex:2 1 0;min-height:0;display:flex;flex-direction:column;padding:0}\n.gas-metric-item{flex:1 1 0;min-height:0;display:flex;align-items:center;gap:4px;padding:4px 6px}\n.gas-metric-item>span{flex:1 1 auto;text-align:left;font-size:8px}\n.gas-metric-item>div{flex:0 0 auto;display:flex;flex-direction:row;align-items:baseline;gap:3px}\n.gas-metric-item strong{font-size:17px;line-height:1}\n.gas-metric-item small{font-size:6.5px}\n.gas-metric-item+.gas-metric-item{border-left:0;border-top:1px solid #26343c}\n.cursor-hint{flex:0 0 auto}\n}\n@media (max-width:400px){.screen-body{grid-template-columns:minmax(0,1fr) 108px}.waveforms .alarm-banner{width:calc(100% + 108px - 78px);margin-right:calc(-108px + 78px)}.metrics-actions{width:78px}}\n'''
p.write_text(s)
