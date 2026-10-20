import { useState } from 'react'
import { TeachingInstructorWorkspace } from '../teaching/TeachingWorkspace'
import { TeachingMediaInstructorPanel } from '../teaching/TeachingMediaPanel'
import { useTeachingPrompts, useTeachingQuestionLibrary } from '../teaching/useTeachingInteractions'
import type { TeachingHostAdapter } from '../teaching/types'

export function EdumonTeachingLibraries({ host }: { host: TeachingHostAdapter }) {
  const [scenarioMediaIds, setScenarioMediaIds] = useState<string[]>([])
  const prompts = useTeachingPrompts('standalone', null, host)
  const library = useTeachingQuestionLibrary(host)
  const instructorAuthenticated = Boolean(library.author)

  return (
    <div className="edumon-teaching-library-stage">
      <div className="edumon-teaching-library-intro">
        <strong>Shared teaching library</strong>
        <span>EDUMON uses the same media and Questions & Polls infrastructure as EDUVENT. Session presentation will use these same components when EDUMON instructor/candidate sessions are connected.</span>
      </div>

      <TeachingMediaInstructorPanel
        role="standalone"
        instructorAuthenticated={instructorAuthenticated}
        sessionId={null}
        scenarioMediaIds={scenarioMediaIds}
        onScenarioMediaIdsChange={setScenarioMediaIds}
      />

      <TeachingInstructorWorkspace
        role="standalone"
        instructorAuthenticated={instructorAuthenticated}
        host={host}
        activePrompt={prompts.activePrompt}
        responses={prompts.responses}
        candidateCount={0}
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
