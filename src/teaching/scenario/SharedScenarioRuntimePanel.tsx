import { useEffect, useState } from 'react'
import { createCaseMediaSignedUrl, listCaseMediaByIds } from '../../caseMedia'
import { SharedDraggableModal } from '../SharedDraggableModal'
import type { TeachingScenarioStageContent } from './runtimeCore'
import { setScenarioRuntimeIndicator, useScenarioRuntimeTriggerInfo } from './runtimeUiState'
import './SharedScenarioRuntimePanel.css'

export interface SharedScenarioBranchAction {
  id: string
  label: string
  targetLabel?: string
  onSelect: () => void | Promise<void>
}

interface SharedScenarioRuntimePanelProps {
  scenarioName: string
  stageName: string
  stageNumber: number
  stageCount: number
  instructions?: string
  /** Backwards-compatible alias for instructions. */
  notes?: string
  content?: TeachingScenarioStageContent
  manualAdvanceAvailable?: boolean
  onAdvance?: () => void | Promise<void>
  /** Retained for caller compatibility; previous-stage navigation is no longer shown. */
  previousAvailable?: boolean
  /** Retained for caller compatibility; previous-stage navigation is no longer shown. */
  onPrevious?: () => void | Promise<void>
  branchActions?: SharedScenarioBranchAction[]
  complete?: boolean
  completionTitle?: string
  completionMessage?: string
  selfDirected?: boolean
  onQuestionResult?: (answered: boolean, correct: boolean) => void
  onMediaEvent?: (event: 'ended' | 'acknowledged') => void
  onClose?: () => void
}

export function SharedScenarioRuntimePanel({
  scenarioName,
  stageName,
  stageNumber,
  stageCount,
  instructions,
  notes,
  content,
  manualAdvanceAvailable,
  onAdvance,
  branchActions = [],
  complete = false,
  completionTitle = 'Scenario complete',
  completionMessage = 'You have reached the end of this scenario.',
  selfDirected = false,
  onQuestionResult,
  onMediaEvent,
  onClose,
}: SharedScenarioRuntimePanelProps) {
  const [answerId, setAnswerId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null)
  const [mediaAcknowledged, setMediaAcknowledged] = useState(false)
  const [hidden, setHidden] = useState(false)
  const triggerInfo = useScenarioRuntimeTriggerInfo()

  useEffect(() => {
    setAnswerId(null)
    setSubmitted(false)
    setMediaAcknowledged(false)
    setHidden(false)
    onQuestionResult?.(false, false)
  }, [stageNumber])

  const question = content?.kind === 'question' ? content.question : null
  const media = content?.kind === 'media' ? content.media : null
  const instructionText = instructions ?? notes
  const sessionRole = typeof document === 'undefined' ? 'standalone' : document.documentElement.dataset.loppjusimSessionRole
  const manualControlsAllowed = selfDirected || sessionRole !== 'candidate'
  const manualAvailable = manualControlsAllowed && !complete && (Boolean(manualAdvanceAvailable) || branchActions.length > 0)

  useEffect(() => {
    if (selfDirected) return
    setScenarioRuntimeIndicator({
      label: `${stageNumber}/${stageCount} · ${stageName}`,
      manualAvailable,
      open: () => setHidden(false),
    })
    return () => setScenarioRuntimeIndicator(null)
  }, [selfDirected, stageNumber, stageCount, stageName, manualAvailable])

  useEffect(() => {
    setResolvedMediaUrl(null)
    if (!media) return
    if (/^(https?:|data:|blob:)/i.test(media.storagePath)) {
      setResolvedMediaUrl(media.storagePath)
      return
    }
    if (!media.mediaId) return
    let cancelled = false
    void listCaseMediaByIds([media.mediaId])
      .then((rows) => rows[0] ? createCaseMediaSignedUrl(rows[0].storage_path, 3600) : null)
      .then((url) => { if (!cancelled) setResolvedMediaUrl(url) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [media?.mediaId, media?.storagePath])

  const submit = () => {
    if (!question || !answerId) return
    const correct = question.kind === 'poll' || question.correctOptionId == null || question.correctOptionId === answerId
    setSubmitted(true)
    onQuestionResult?.(true, correct)
  }

  const runSingleManualAction = () => {
    if (!manualAvailable) return
    if (branchActions.length === 1) {
      void branchActions[0].onSelect()
      return
    }
    if (branchActions.length === 0 && manualAdvanceAvailable) void onAdvance?.()
  }

  const safeStageCount = Math.max(1, stageCount)
  const progress = Math.max(0, Math.min(100, (stageNumber / safeStageCount) * 100))

  const panelBody = <>
    <div className="shared-scenario-runtime-progress" aria-label={`Scenario progress: stage ${stageNumber} of ${stageCount}`}><i style={{ width: `${progress}%` }} /></div>
    {instructionText && <p className="shared-scenario-runtime-instructions">{instructionText}</p>}
    {media && <div className="shared-scenario-runtime-media">
      <strong>{media.title || 'Scenario media'}</strong>
      {resolvedMediaUrl ? (media.mediaKind === 'video' ? <video controls playsInline src={resolvedMediaUrl} onEnded={() => onMediaEvent?.('ended')} /> : <img src={resolvedMediaUrl} alt={media.title || 'Scenario media'} />) : <small>{media.mediaId ? 'Loading scenario media…' : `Teaching media reference: ${media.storagePath || 'not selected'}`}</small>}
      {!mediaAcknowledged && <button type="button" className="scenario-builder-primary" onClick={() => { setMediaAcknowledged(true); onMediaEvent?.('acknowledged') }}>Acknowledge media</button>}
      {mediaAcknowledged && <small>Media acknowledged.</small>}
    </div>}
    {question && !complete && <div className="shared-scenario-runtime-question">
      {question.title && <strong>{question.title}</strong>}<p>{question.body}</p>
      <div>{question.options.map((option) => <label key={option.id}><input type="radio" name={`scenario-runtime-question-${stageNumber}`} checked={answerId === option.id} disabled={submitted} onChange={() => setAnswerId(option.id)} /><span>{option.text}</span></label>)}</div>
      {!submitted ? <button type="button" disabled={!answerId} onClick={submit}>Submit answer</button> : <div className="shared-scenario-runtime-answer">Answer submitted.{question.explanation ? ` ${question.explanation}` : ''}</div>}
    </div>}
    {complete ? <div className="shared-scenario-runtime-complete"><strong>{completionTitle}</strong><span>{completionMessage}</span></div> : manualControlsAllowed && <div className="shared-scenario-runtime-triggers">
      <strong>Triggers</strong>
      <button
        type="button"
        className="shared-scenario-trigger-row manual"
        disabled={!manualAvailable}
        onClick={branchActions.length <= 1 ? runSingleManualAction : undefined}
      >
        <span>Manual</span>
        <em>{!manualAvailable ? 'Not available' : branchActions.length > 1 ? 'Choose a path below' : 'Available'}</em>
      </button>
      {branchActions.length > 1 && <div className="shared-scenario-manual-paths">
        {branchActions.map((branch) => <button type="button" key={branch.id} onClick={() => void branch.onSelect()}>
          <span>{branch.label}</span>{branch.targetLabel && <em>→ {branch.targetLabel}</em>}
        </button>)}
      </div>}
      {triggerInfo.map((trigger) => <div className="shared-scenario-trigger-row informational" key={trigger.id}>
        <span>{trigger.label}</span>
        <em>{trigger.detail}</em>
      </div>)}
    </div>}
  </>

  if (!selfDirected) {
    if (hidden) return null
    return <SharedDraggableModal ariaLabel="Active scenario stage" eyebrow={scenarioName} title={`${stageNumber}/${stageCount} · ${stageName}`} onClose={() => setHidden(true)} closeLabel="Hide stage controls" className={`shared-scenario-runtime-modal ${complete ? 'complete' : ''}`}>
      <div className={`shared-scenario-runtime-panel modal-runtime ${complete ? 'complete' : ''}`}>{panelBody}</div>
    </SharedDraggableModal>
  }

  return <aside className={`shared-scenario-runtime-panel self-directed ${complete ? 'complete' : ''}`} aria-label="Active scenario stage">
    <header>
      <div><span>{scenarioName}</span><strong>{stageNumber}/{stageCount} · {stageName}</strong></div>
      {onClose && <button type="button" onClick={onClose} aria-label="Exit scenario">×</button>}
    </header>
    {panelBody}
  </aside>
}
