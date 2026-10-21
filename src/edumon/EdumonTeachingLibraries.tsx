import { useState, type ReactNode } from 'react'
import { SharedTeachingTab } from '../teaching/SharedTeachingTab'
import { useTeachingPrompts, useTeachingQuestionLibrary } from '../teaching/useTeachingInteractions'
import type { TeachingHostAdapter, TeachingRole } from '../teaching/types'

interface EdumonTeachingLibrariesProps {
  host: TeachingHostAdapter
  role?: TeachingRole
  sessionId?: string | null
  candidateCount?: number
  sessionPanel?: ReactNode
  activeScenario?: ReactNode
  runtimeHost?: ReactNode
  liveRoom?: ReactNode
}

/** EDUMON adapter around the shared EDUSIM Teaching tab. */
export function EdumonTeachingLibraries({
  host,
  role = 'standalone',
  sessionId = null,
  candidateCount = 0,
  sessionPanel = null,
  activeScenario,
  runtimeHost,
  liveRoom,
}: EdumonTeachingLibrariesProps) {
  const [scenarioMediaIds, setScenarioMediaIds] = useState<string[]>([])
  const prompts = useTeachingPrompts(role, sessionId, host)
  const library = useTeachingQuestionLibrary(host)
  const instructorAuthenticated = Boolean(library.author)

  return (
    <SharedTeachingTab
      role={role}
      instructorAuthenticated={instructorAuthenticated}
      host={host}
      sessionId={sessionId}
      candidateCount={candidateCount}
      sessionPanel={sessionPanel}
      scenarioMediaIds={scenarioMediaIds}
      onScenarioMediaIdsChange={setScenarioMediaIds}
      prompts={prompts}
      library={library}
      activeScenario={activeScenario}
      runtimeHost={runtimeHost}
      liveRoom={liveRoom}
    />
  )
}
