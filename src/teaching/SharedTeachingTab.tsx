import type { ReactNode } from 'react'
import { TeachingInstructorWorkspace } from './TeachingWorkspace'
import { TeachingMediaInstructorPanel } from './TeachingMediaPanel'
import { TeachingSessionLogPanel } from './TeachingSessionLogPanel'
import type { TeachingHostAdapter, TeachingRole } from './types'
import { useTeachingPrompts, useTeachingQuestionLibrary } from './useTeachingInteractions'
import './TeachingLayoutFixes.css'

export type TeachingPromptsController = ReturnType<typeof useTeachingPrompts>
export type TeachingQuestionLibraryController = ReturnType<typeof useTeachingQuestionLibrary>

interface SharedTeachingTabProps {
  role: TeachingRole
  instructorAuthenticated: boolean
  host: TeachingHostAdapter
  sessionId: string | null
  candidateCount: number
  sessionPanel: ReactNode
  scenarioMediaIds: string[]
  onScenarioMediaIdsChange: (ids: string[]) => void
  prompts: TeachingPromptsController
  library: TeachingQuestionLibraryController
  activeScenario?: ReactNode
  runtimeHost?: ReactNode
  liveRoom?: ReactNode
  footer?: ReactNode
}

export function SharedTeachingTab({
  role,
  instructorAuthenticated,
  host,
  sessionId,
  candidateCount,
  sessionPanel,
  scenarioMediaIds,
  onScenarioMediaIdsChange,
  prompts,
  library,
  activeScenario,
  runtimeHost,
  liveRoom,
  footer,
}: SharedTeachingTabProps) {
  return (
    <div className="shared-teaching-tab">
      {sessionPanel}
      {role !== 'candidate' && activeScenario}
      {role !== 'candidate' && !instructorAuthenticated ? (
        <div className="teaching-more-features-note">Instructor account needed for more features</div>
      ) : (
        <>
          <TeachingMediaInstructorPanel
            role={role}
            instructorAuthenticated={instructorAuthenticated}
            environmentId={host.libraryEnvironmentId}
            sessionId={sessionId}
            scenarioMediaIds={scenarioMediaIds}
            onScenarioMediaIdsChange={onScenarioMediaIdsChange}
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
            libraryAvailable={Boolean(library.author)}
            libraryBusy={library.busy}
            libraryError={library.error}
            onPresent={prompts.presentPrompt}
            onClose={prompts.closePrompt}
            onReleaseAnswer={prompts.releaseAnswer}
            onSaveLibrary={library.save}
          />
        </>
      )}
      <TeachingSessionLogPanel productId={host.appId} sessionId={sessionId} role={role} />
      {runtimeHost}
      {liveRoom}
      {footer}
    </div>
  )
}
