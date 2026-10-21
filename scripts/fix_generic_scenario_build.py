from pathlib import Path

p=Path('src/components/InstructorAccountControls.tsx')
s=p.read_text()
s=s.replace('createInstructorPreset(', 'scenarioLibrary.create(')
s=s.replace('updateInstructorPreset(', 'scenarioLibrary.update(')
s=s.replace('deleteInstructorPreset(', 'scenarioLibrary.remove(')
p.write_text(s)

p=Path('src/scenario-builder/SharedScenarioEditorFramework.tsx')
s=p.read_text().replace('checked={selectedStage.question.correctOptionId === option.id}', 'checked={selectedStage.question!.correctOptionId === option.id}')
p.write_text(s)

p=Path('src/scenario-builder/modules/ventilator/authoringAdapter.tsx')
s=p.read_text().replace('          media: stage.media,\n          question: stage.question,', "          media: stage.media ? { ...stage.media, mediaId: stage.media.mediaId ?? stage.media.storagePath } : undefined,\n          question: stage.question,")
p.write_text(s)

p=Path('src/edumon/EdumonApp.tsx')
s=p.read_text().replace('          onAdvance={() => scenarioRuntime.advance(elapsed)}', '          onAdvance={async () => { await scenarioRuntime.advance(elapsed) }}')
p.write_text(s)
