from pathlib import Path

p = Path('src/components/DynamicScenarioBuilder.tsx')
s = p.read_text()

# State for desktop drag-and-drop feedback.
s = s.replace(
"  const [collapsedStages, setCollapsedStages] = useState<Set<number>>(() => new Set())\n",
"  const [collapsedStages, setCollapsedStages] = useState<Set<number>>(() => new Set())\n  const [draggedStageIndex, setDraggedStageIndex] = useState<number | null>(null)\n  const [dragOverStageIndex, setDragOverStageIndex] = useState<number | null>(null)\n",
1,
)

# Improve insertion and add reordering helper.
old = """  const insertStage = (index: number) => {
    setCollapsedStages(new Set())
    setDraft((current) => {
      const stages = [...current.stages]
      stages.splice(index + 1, 0, newStage(currentScenario, index + 1))
      return { ...current, stages }
    })
    setTriggerMenuIndex(null)
  }

"""
new = """  const insertStage = (index: number) => {
    setCollapsedStages(new Set())
    setDraft((current) => {
      const stages = [...current.stages]
      const base = stages[index]?.snapshot ?? currentScenario
      stages.splice(index + 1, 0, newStage(base, index + 1))
      return { ...current, stages }
    })
    setTriggerMenuIndex(null)
  }

  const moveStage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= draft.stages.length || toIndex >= draft.stages.length) return
    setCollapsedStages(new Set())
    setTriggerMenuIndex(null)
    setDraft((current) => {
      const stages = [...current.stages]
      const [moved] = stages.splice(fromIndex, 1)
      stages.splice(toIndex, 0, moved)
      if (stages[0]) stages[0] = { ...stages[0], transition: immediateTransition() }
      return { ...current, stages }
    })
  }

  const beginStageDrag = (index: number, event: React.DragEvent<HTMLElement>) => {
    setDraggedStageIndex(index)
    setDragOverStageIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  const finishStageDrag = () => {
    setDraggedStageIndex(null)
    setDragOverStageIndex(null)
  }

"""
if old not in s:
    raise SystemExit('insertStage anchor not found')
s = s.replace(old, new, 1)

# Make stage shell a drop target and style drag state.
old = """              <div className=\"dynamic-stage-shell\" key={`${index}-${stage.name}`}>
                <article className=\"dynamic-stage-card\">
"""
new = """              <div
                className={`dynamic-stage-shell ${draggedStageIndex === index ? 'dragging' : ''} ${dragOverStageIndex === index && draggedStageIndex !== index ? 'drag-over' : ''}`}
                key={`${index}-${stage.name}`}
                onDragOver={(event) => {
                  if (draggedStageIndex == null) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDragOverStageIndex(index)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const source = draggedStageIndex ?? Number(event.dataTransfer.getData('text/plain'))
                  if (Number.isInteger(source)) moveStage(source, index)
                  finishStageDrag()
                }}
              >
                <article className=\"dynamic-stage-card\">
"""
if old not in s:
    raise SystemExit('stage shell anchor not found')
s = s.replace(old, new, 1)

# Add drag handle and arrow fallbacks before collapse/remove controls.
old = """                    <div className=\"dynamic-stage-title-actions\">
                      <button
                        type=\"button\"
                        className=\"dynamic-stage-collapse\"
"""
new = """                    <div className=\"dynamic-stage-title-actions\">
                      <button
                        type=\"button\"
                        className=\"dynamic-stage-drag-handle\"
                        draggable
                        onDragStart={(event) => beginStageDrag(index, event)}
                        onDragEnd={finishStageDrag}
                        aria-label={`Drag Stage ${index + 1} to reorder`}
                        title=\"Drag stage to reorder\"
                      >⋮⋮</button>
                      <button
                        type=\"button\"
                        className=\"dynamic-stage-move\"
                        disabled={index === 0}
                        onClick={() => moveStage(index, index - 1)}
                        aria-label={`Move Stage ${index + 1} up`}
                        title=\"Move stage up\"
                      >↑</button>
                      <button
                        type=\"button\"
                        className=\"dynamic-stage-move\"
                        disabled={index === draft.stages.length - 1}
                        onClick={() => moveStage(index, index + 1)}
                        aria-label={`Move Stage ${index + 1} down`}
                        title=\"Move stage down\"
                      >↓</button>
                      <button
                        type=\"button\"
                        className=\"dynamic-stage-collapse\"
"""
if old not in s:
    raise SystemExit('title actions anchor not found')
s = s.replace(old, new, 1)

# Add insert control after each stage/trigger block. Last one acts as append.
old = """                </div>
              </div>
            )
          })}
"""
new = """                </div>

                <div className=\"dynamic-stage-insert-row\" aria-label={index < draft.stages.length - 1 ? `Insert stage between Stage ${index + 1} and Stage ${index + 2}` : 'Add stage'}>
                  <span />
                  <button
                    type=\"button\"
                    className=\"dynamic-stage-insert\"
                    onClick={() => insertStage(index)}
                    title={index < draft.stages.length - 1 ? `Insert a new stage between Stage ${index + 1} and Stage ${index + 2}` : 'Add a new stage'}
                  >＋ <small>{index < draft.stages.length - 1 ? 'Insert stage' : 'Add stage'}</small></button>
                  <span />
                </div>
              </div>
            )
          })}
"""
if old not in s:
    raise SystemExit('stage end anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)

# CSS for ordering controls and insertion affordance.
p = Path('src/components/DynamicScenarioBuilder.css')
s = p.read_text()
s += """

/* Scenario Builder v0.5.1 stage ordering */
.dynamic-stage-title-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.dynamic-stage-drag-handle,
.dynamic-stage-move {
  min-width: 30px;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 0;
  font-size: 13px;
  line-height: 1;
}

.dynamic-stage-drag-handle {
  cursor: grab;
  color: #9eb1b8;
  letter-spacing: -3px;
}

.dynamic-stage-drag-handle:active { cursor: grabbing; }
.dynamic-stage-move:disabled { opacity: .28; cursor: default; }
.dynamic-stage-shell.dragging { opacity: .48; }
.dynamic-stage-shell.drag-over > .dynamic-stage-card { outline: 2px solid #70c7df; outline-offset: 2px; }

.dynamic-stage-insert-row {
  display: grid;
  grid-template-columns: minmax(20px, 1fr) auto minmax(20px, 1fr);
  align-items: center;
  gap: 10px;
  width: min(760px, 94%);
  margin: 5px auto 12px;
}

.dynamic-stage-insert-row > span {
  height: 1px;
  background: rgba(112, 199, 223, .28);
}

.dynamic-stage-insert {
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid #405862;
  border-radius: 0;
  background: #0a171c;
  color: #a7dce9;
  font-size: 12px;
}

.dynamic-stage-insert small {
  margin-left: 4px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
}

@media (pointer: coarse) {
  .dynamic-stage-drag-handle { display: none; }
  .dynamic-stage-move { min-width: 36px; width: 36px; height: 34px; }
}
"""
p.write_text(s)

Path('src/scenario-builder/version.ts').write_text("export const SCENARIO_BUILDER_VERSION = '0.5.1'\n")
