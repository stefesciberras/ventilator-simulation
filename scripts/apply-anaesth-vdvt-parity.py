from pathlib import Path

p = Path('src/edumon/EdumonWorkspacePanel.tsx')
text = p.read_text()
old = "    const nextRespiratory = { ...respiratory, ...patch }\n    nextRespiratory.deadSpaceMl = Math.min(nextRespiratory.deadSpaceMl, Math.max(0, nextRespiratory.tidalVolumeMl))\n    onPatientStateChange({ ...patientState, respiratory: nextRespiratory })\n"
new = "    const nextRespiratory = { ...respiratory, ...patch }\n    onPatientStateChange({ ...patientState, respiratory: nextRespiratory })\n"
if old not in text:
    raise SystemExit('updateRespiratory block not found')
text = text.replace(old, new, 1)
old = "          <label className=\"edumon-signal-control edumon-signal-capnography\"><span>Dead space <b>{Math.round(respiratory.deadSpaceMl)} mL</b></span><input disabled={patientControlsLocked} type=\"range\" min=\"0\" max={Math.max(0, respiratory.tidalVolumeMl)} step=\"10\" value={respiratory.deadSpaceMl} onChange={(event) => updateRespiratory({ deadSpaceMl: Number(event.target.value) })} /></label>\n"
new = "          <label className=\"edumon-signal-control edumon-signal-capnography\"><span>Vd/Vt <b>{respiratory.vdVt.toFixed(2)}</b></span><input disabled={patientControlsLocked} type=\"range\" min=\"0.1\" max=\"0.9\" step=\"0.05\" value={respiratory.vdVt} onChange={(event) => updateRespiratory({ vdVt: Number(event.target.value) })} /></label>\n"
if old not in text:
    raise SystemExit('dead-space control not found')
p.write_text(text.replace(old, new, 1))
