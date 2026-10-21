import fs from 'node:fs'

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing target: ${label}`)
  return text.replace(from, to)
}

// Shared basic session panel: candidate invitation + live roster.
{
  const path = 'src/teaching/session/SharedSessionModePanel.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { useEffect, useRef, useState } from 'react'", "import { useEffect, useMemo, useRef, useState } from 'react'", 'react useMemo')
  text = replaceOnce(text, "import type { ReactNode } from 'react'\n", "import type { ReactNode } from 'react'\nimport { SharedCandidateInvitation } from './SharedCandidateInvitation'\nimport { SharedInstructorLiveRoom } from './SharedInstructorLiveRoom'\n", 'shared imports')
  text = replaceOnce(text, "  footer?: ReactNode\n}", "  footer?: ReactNode\n  productId?: string\n  productLabel?: string\n  productDescription?: string\n  renderCandidateTelemetry?: (member: SharedTeachingMemberRow) => ReactNode\n}", 'basic session props')
  text = replaceOnce(text, "  instructorStart,\n  footer,\n  ...launcherProps", "  instructorStart,\n  footer,\n  productId = 'edusim',\n  productLabel = 'EDUSIM',\n  productDescription = 'interactive clinical simulation',\n  renderCandidateTelemetry,\n  ...launcherProps", 'basic destructure')
  text = replaceOnce(text, "  const candidateCount = members.filter((member) => member.role === 'candidate').length\n", "  const candidateCount = members.filter((member) => member.role === 'candidate').length\n  const candidateJoinUrl = useMemo(() => {\n    if (!session?.session_key || typeof window === 'undefined') return ''\n    const url = new URL(window.location.href)\n    url.search = ''\n    url.hash = ''\n    url.searchParams.set('session', session.session_key)\n    return url.toString()\n  }, [session?.session_key])\n", 'join url')
  text = replaceOnce(text, "          {role === 'instructor' && <p>{candidateCount} candidate{candidateCount === 1 ? '' : 's'} joined.</p>}\n          {role === 'candidate' && <p>Connected to the instructor's teaching session.</p>}", "          {role === 'instructor' && <>\n            <p>{candidateCount} candidate{candidateCount === 1 ? '' : 's'} joined.</p>\n            {session?.id && session.session_key && candidateJoinUrl && <SharedCandidateInvitation sessionId={session.id} sessionKey={session.session_key} joinUrl={candidateJoinUrl} productId={productId} productLabel={productLabel} productDescription={productDescription} />}\n            <SharedInstructorLiveRoom role={role} members={members} renderTelemetry={renderCandidateTelemetry} storageKey={`${productId}-instructor-live-room`} />\n          </>}\n          {role === 'candidate' && <p>Connected to the instructor's teaching session.</p>}", 'instructor shared room')
  fs.writeFileSync(path, text)
}

// Export the shared session surfaces.
{
  const path = 'src/teaching/session/index.ts'
  let text = fs.readFileSync(path, 'utf8')
  if (!text.includes("SharedCandidateInvitation")) text += "\nexport * from './SharedCandidateInvitation'\nexport * from './SharedInstructorLiveRoom'\n"
  fs.writeFileSync(path, text)
}

// EDUVENT live roster now renders through the shared roster shell.
{
  const path = 'src/components/SessionPanel.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { SharedInstructorStartWizard, SharedSessionLauncher } from '../teaching/session'", "import { SharedInstructorLiveRoom, SharedInstructorStartWizard, SharedSessionLauncher } from '../teaching/session'", 'eduvent shared room import')
  const start = text.indexOf('export function InstructorLiveRoom(')
  const end = text.indexOf('\nexport function SessionPanel(', start)
  if (start < 0 || end < 0) throw new Error('Missing InstructorLiveRoom block')
  const replacement = `export function InstructorLiveRoom({ role, members }: { role: SessionRole; members: SessionMemberRow[] }) {\n  return <SharedInstructorLiveRoom\n    role={role}\n    members={members}\n    storageKey="instructor-live-room"\n    renderTelemetry={(member) => {\n      const vent = hasVentilatorSettings(member.ventilator_settings) ? member.ventilator_settings : null\n      const patient = hasPatientSettings(member.patient_settings) ? member.patient_settings : null\n      return <div className="candidate-state-grid">\n        <div><span>Mode</span><strong>{vent?.mode ?? '—'}</strong></div>\n        <div><span>FiO₂</span><strong>{vent ? \`${'${Math.round(vent.fio2 * 100)}'}%\` : '—'}</strong></div>\n        <div><span>PEEP</span><strong>{vent?.peep ?? '—'}</strong></div>\n        <div><span>RR set</span><strong>{vent?.rate ?? '—'}</strong></div>\n        <div><span>Compliance</span><strong>{patient ? patient.compliance.toFixed(0) : '—'}</strong></div>\n        <div><span>Rinsp</span><strong>{patient ? patient.resistance.toFixed(0) : '—'}</strong></div>\n        <div><span>Spont RR</span><strong>{patient ? patient.spontaneousRate.toFixed(0) : '—'}</strong></div>\n        <div><span>Effort</span><strong>{patient ? patient.effort.toFixed(0) : '—'}</strong></div>\n      </div>\n    }}\n  />\n}\n`
  text = text.slice(0, start) + replacement + text.slice(end)
  fs.writeFileSync(path, text)
}

// EDUMON uses shared session invitation/roster and shared workspace shell.
{
  const path = 'src/edumon/EdumonApp.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(text, "import { SimulationDiagnosticsMenu, type SimulationDiagnosticAction } from '../components/SimulationDiagnosticsMenu'\n", "import { SimulationDiagnosticsMenu, type SimulationDiagnosticAction } from '../components/SimulationDiagnosticsMenu'\nimport { SimulationWorkspaceShell } from '../components/SimulationWorkspaceShell'\n", 'workspace shell import')
  text = replaceOnce(text, "      instructorStart={{", "      productId={teachingHost.appId}\n      productLabel={module.productName}\n      productDescription={module.subtitle}\n      renderCandidateTelemetry={(member) => {\n        const state = (member as typeof teachingSession.members[number]).product_state as EdumonTeachingState | undefined\n        if (!state?.patient) return null\n        const p = state.patient\n        return <div className=\"candidate-state-grid\">\n          <div><span>Rhythm</span><strong>{RHYTHM_LABELS[p.rhythm]}</strong></div>\n          <div><span>HR</span><strong>{Math.round(p.heartRate)}</strong></div>\n          <div><span>ART</span><strong>{Math.round(p.systolicPressure)}/{Math.round(p.diastolicPressure)}</strong></div>\n          <div><span>SpO₂</span><strong>{Math.round(p.spo2)}%</strong></div>\n        </div>\n      }}\n      instructorStart={{", 'edumon session shared props')
  text = replaceOnce(text, "      <div className=\"workspace edumon-workspace\">\n        <section className=\"ventilator-console edumon-console\"", "      <SimulationWorkspaceShell\n        workspaceClassName=\"edumon-workspace\"\n        switcherClassName=\"edumon-mobile-workspace-switcher\"\n        displayPageClassName=\"mobile-page-monitor\"\n        controlsPageClassName=\"mobile-page-controls\"\n        displayLabel=\"Display\"\n        controlsLabel=\"Controls\"\n        ariaLabel=\"EDUMON workspace pages\"\n        display={(\n        <section className=\"ventilator-console edumon-console\"", 'edumon workspace opening')
  const panelLine = '        <EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} teachingHost={teachingHost} teachingRole={teachingSession.role} teachingSessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} controlsLocked={candidateLocked} sessionPanel={sessionPanel} meanPressure={measurements.meanPressure} />\n      </div>'
  const panelReplacement = '        )}\n        controls={<EdumonWorkspacePanel patientState={patientState} onPatientStateChange={setPatientState} teachingHost={teachingHost} teachingRole={teachingSession.role} teachingSessionId={teachingSession.session?.id ?? null} candidateCount={candidateCount} controlsLocked={candidateLocked} sessionPanel={sessionPanel} meanPressure={measurements.meanPressure} />}\n      />'
  text = replaceOnce(text, panelLine, panelReplacement, 'edumon workspace closing')
  fs.writeFileSync(path, text)
}

fs.writeFileSync('src/edumon/appVersion.ts', "export const EDUMON_APP_VERSION = '0.1.0.3'\n")
fs.writeFileSync('src/appVersion.ts', "export const APP_VERSION = '0.83.0.3'\n")

console.log('Shared session UI extraction applied.')
