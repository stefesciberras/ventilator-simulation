import { useEffect, useState, type ReactNode } from 'react'
import { SecondaryMonitorSurface } from '../components/SecondaryMonitorSurface'
import { LOPPJUSIM_OPEN_SESSIONS_EVENT } from '../core/platformEvents'
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
  /** Optional shared session-management panel opened from the platform Sessions menu. */
  sessionPanel?: ReactNode
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
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false)

  useEffect(() => {
    if (!sessionPanel) return
    const openSessions = () => setSessionPanelOpen(true)
    window.addEventListener(LOPPJUSIM_OPEN_SESSIONS_EVENT, openSessions)
    return () => window.removeEventListener(LOPPJUSIM_OPEN_SESSIONS_EVENT, openSessions)
  }, [sessionPanel])

  return (
    <div className="shared-teaching-tab">
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
      {sessionPanel && sessionPanelOpen && (
        <SecondaryMonitorSurface
          title="Sessions"
          eyebrow="LOPPJUSIM SESSION"
          onClose={() => setSessionPanelOpen(false)}
          ariaModal
        >
          {sessionPanel}
        </SecondaryMonitorSurface>
      )}
    </div>
  )
}
