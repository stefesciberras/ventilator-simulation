import { useEffect, useState } from 'react'
import type { TeachingScenarioStageContent } from './runtimeCore'

interface SharedScenarioRuntimePanelProps {
  scenarioName: string
  stageName: string
  stageNumber: number
  stageCount: number
  notes?: string
  content?: TeachingScenarioStageContent
  manualAdvanceAvailable?: boolean
  onAdvance?: () => void | Promise<void>
  onQuestionResult?: (answered: boolean, correct: boolean) => void
  onClose?: () => void
}

export function SharedScenarioRuntimePanel({
  scenarioName,
  stageName,
  stageNumber,
  stageCount,
  notes,
  content,
  manualAdvanceAvailable,
  onAdvance,
  onQuestionResult,
  onClose,
}: SharedScenarioRuntimePanelProps) {
  const [answerId, setAnswerId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setAnswerId(null)
    setSubmitted(false)
    onQuestionResult?.(false, false)
  }, [stageNumber])

  const question = content?.kind === 'question' ? content.question : null
  const media = content?.kind === 'media' ? content.media : null
  const submit = () => {
    if (!question || !answerId) return
    const correct = question.kind === 'poll' || question.correctOptionId == null || question.correctOptionId === answerId
    setSubmitted(true)
    onQuestionResult?.(true, correct)
  }

  return <aside className="shared-scenario-runtime-panel" aria-label="Active scenario stage">
    <header>
      <div><span>{scenarioName}</span><strong>{stageNumber}/{stageCount} · {stageName}</strong></div>
      {onClose && <button type="button" onClick={onClose} aria-label="Close scenario">×</button>}
    </header>
    {notes && <p>{notes}</p>}
    {media && <div className="shared-scenario-runtime-media">
      <strong>{media.title || 'Scenario media'}</strong>
      {/^(https?:|data:|blob:)/i.test(media.storagePath) ? (
        media.mediaKind === 'video'
          ? <video controls src={media.storagePath} />
          : <img src={media.storagePath} alt={media.title || 'Scenario media'} />
      ) : <small>Teaching media reference: {media.mediaId || media.storagePath || 'not selected'}</small>}
    </div>}
    {question && <div className="shared-scenario-runtime-question">
      {question.title && <strong>{question.title}</strong>}
      <p>{question.body}</p>
      <div>{question.options.map((option) => <label key={option.id}><input type="radio" name="scenario-runtime-question" checked={answerId === option.id} disabled={submitted} onChange={() => setAnswerId(option.id)} /><span>{option.text}</span></label>)}</div>
      {!submitted ? <button type="button" disabled={!answerId} onClick={submit}>Submit answer</button> : <div className="shared-scenario-runtime-answer">Answer submitted.{question.explanation ? ` ${question.explanation}` : ''}</div>}
    </div>}
    {manualAdvanceAvailable && <button type="button" className="scenario-builder-primary" onClick={() => void onAdvance?.()}>Next stage</button>}
  </aside>
}
