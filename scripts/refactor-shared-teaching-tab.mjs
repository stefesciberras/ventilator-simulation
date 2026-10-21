import fs from 'node:fs'

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`)
  return text.replace(from, to)
}

{
  const path = 'src/App.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceRequired(
    text,
    "import { TeachingCandidateOverlay, TeachingInstructorWorkspace, TeachingLaserPointerSurface, TeachingMediaInstructorPanel, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'",
    "import { SharedTeachingTab, TeachingCandidateOverlay, TeachingLaserPointerSurface, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary, type TeachingMetricSnapshot } from './teaching'",
    'EDUVENT teaching import',
  )

  const start = text.indexOf('                <SessionPanel\n', text.indexOf("{controlTab === 'teaching'"))
  const endMarker = '                <InstructorLiveRoom role={teachingSession.role} members={teachingSession.members} />'
  const end = text.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error('Unable to locate EDUVENT teaching pane body')
  const endPos = end + endMarker.length

  const replacement = `                <SharedTeachingTab
                  role={teachingSession.role}
                  instructorAuthenticated={instructorAccountConnected}
                  host={eduventTeachingHost}
                  sessionId={teachingSession.session?.id ?? null}
                  candidateCount={teachingSession.members.filter((member) => member.role === 'candidate').length}
                  sessionPanel={(
                    <SessionPanel
                      role={teachingSession.role}
                      instructorAuthenticated={instructorAccountConnected}
                      simulatorExpanded={teachingSession.role === 'instructor'}
                      onSimulatorExpandedChange={() => undefined}
                      connection={teachingSession.connection}
                      localRuntimeConnection={teachingSession.localRuntimeConnection}
                      localRuntimeUrl={teachingSession.localRuntimeUrl}
                      runtimeTransportKind={teachingSession.runtimeTransportKind}
                      session={teachingSession.session}
                      simulationPaused={simulationPaused}
                      onSimulationPausedChange={setSimulationPaused}
                      members={teachingSession.members}
                      error={teachingSession.error}
                      recoverableInstructor={teachingSession.recoverableInstructor}
                      recoverableCandidate={teachingSession.recoverableCandidate}
                      currentScenario={currentInstructorScenario}
                      onLoadScenario={loadInstructorScenario}
                      onStartInstructor={startInstructorSession}
                      onResumeInstructor={teachingSession.resumeInstructor}
                      onJoinCandidate={teachingSession.joinCandidate}
                      onResumeCandidate={teachingSession.resumeCandidate}
                      onLeaveSession={teachingSession.leaveSession}
                      onEndInstructorSession={teachingSession.endInstructorSession}
                      onUpdatePolicy={teachingSession.updatePolicy}
                      onBroadcastNow={teachingSession.broadcastNow}
                    />
                  )}
                  scenarioMediaIds={scenarioMediaIds}
                  onScenarioMediaIdsChange={setScenarioMediaIds}
                  prompts={teachingPrompts}
                  library={teachingLibrary}
                  activeScenario={(dynamicScenarioDiagnostic || activeStaticScenarioName) ? (
                    <section className="teaching-active-scenario" aria-label="Active scenario">
                      <div className="teaching-active-scenario-heading">
                        <span>Active scenario</span>
                        <strong className={dynamicScenarioDiagnostic ? 'dynamic' : 'static'}>{dynamicScenarioDiagnostic ? 'Dynamic' : 'Static'}</strong>
                      </div>
                      <div className="teaching-active-scenario-body">
                        <strong>{dynamicScenarioDiagnostic?.scenarioName ?? activeStaticScenarioName}</strong>
                        {dynamicScenarioDiagnostic && <span>Stage {dynamicScenarioDiagnostic.stageIndex + 1}: {dynamicScenarioDiagnostic.stageName}</span>}
                      </div>
                    </section>
                  ) : null}
                  runtimeHost={<div ref={setDynamicScenarioRuntimeHost} className="teaching-scenario-runtime-host" />}
                  liveRoom={<InstructorLiveRoom role={teachingSession.role} members={teachingSession.members} />}
                />`
  text = text.slice(0, start) + replacement + text.slice(endPos)
  fs.writeFileSync(path, text)
}

{
  const path = 'src/edumon/EdumonWorkspacePanel.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceRequired(
    text,
    `      {tab === 'teaching' && (\n        <div className="edumon-side-teaching">\n          {sessionPanel}\n          <EdumonTeachingLibraries host={teachingHost} role={teachingRole} sessionId={teachingSessionId} candidateCount={candidateCount} />\n        </div>\n      )}`,
    `      {tab === 'teaching' && (\n        <div className="edumon-side-teaching">\n          <EdumonTeachingLibraries\n            host={teachingHost}\n            role={teachingRole}\n            sessionId={teachingSessionId}\n            candidateCount={candidateCount}\n            sessionPanel={sessionPanel}\n          />\n        </div>\n      )}`,
    'EDUMON teaching pane',
  )
  fs.writeFileSync(path, text)
}

console.log('Shared teaching tab refactor applied')
