import { useState } from 'react'
import { TeachingInstructorWorkspace } from '../teaching/TeachingWorkspace'
import { TeachingMediaInstructorPanel } from '../teaching/TeachingMediaPanel'
import { useTeachingPrompts, useTeachingQuestionLibrary } from '../teaching/useTeachingInteractions'
import type { TeachingHostAdapter, TeachingRole } from '../teaching/types'

interface EdumonTeachingLibrariesProps {
  host: TeachingHostAdapter
  role?: TeachingRole
  sessionId?: string | null
  candidateCount?: number
}

export function EdumonTeachingLibraries({
  host,
  role = 'standalone',
  sessionId = null,
  candidateCount = 0,
}: EdumonTeachingLibrariesProps) {
  const [scenarioMediaIds, setScenarioMediaIds] = useState<string[]>([])
  const prompts = useTeachingPrompts(role, sessionId, host)
  const library = useTeachingQuestionLibrary(host)
  const instructorAuthenticated = Boolean(library.author)

  return (
    <div className="edumon-teaching-library-stage">
      <div className="edumon-teaching-library-intro">
        <strong>Shared teaching library</strong>
        <span>EDUMON uses the same media and Questions & Polls infrastructure as EDUVENT, including live instructor/candidate sessions.</span>
      </div>

      <TeachingMediaInstructorPanel
        role={role}
        instructorAuthenticated={instructorAuthenticated}
        sessionId={sessionId}
        scenarioMediaIds={scenarioMediaIds}
        onScenarioMediaIdsChange={setScenarioMediaIds}
      />

      <TeachingInstructorWorkspace
        role={role}
        instructorAuthenticated={instructorAuthenticated}
        host={host}
        activePrompt={prompts.activePrompt}
        responses={prompts.responses}
        candidateCount={candidateCount}
        promptBusy={prompts.busy}
        promptError={prompts.error}
        libraryItems={library.items}
        libraryAvailable={instructorAuthenticated}
        libraryBusy={library.busy}
        libraryError={library.error}
        onPresent={prompts.presentPrompt}
        onClose={prompts.closePrompt}
        onReleaseAnswer={prompts.releaseAnswer}
        onSaveLibrary={library.save}
      />
    </div>
  )
}
