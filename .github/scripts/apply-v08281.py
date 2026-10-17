from pathlib import Path

app = Path('src/App.tsx')
text = app.read_text()
old_import = "import { TeachingCandidateOverlay, TeachingInstructorWorkspace, TeachingLaserPointerSurface, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary } from './teaching'"
new_import = "import { TeachingCandidateOverlay, TeachingInstructorWorkspace, TeachingLaserPointerSurface, TeachingMediaInstructorPanel, eduventTeachingHost, useTeachingPrompts, useTeachingQuestionLibrary } from './teaching'"
assert old_import in text
text = text.replace(old_import, new_import, 1)

old_top = '''          <CaseMediaPanel
            role={teachingSession.role}
            sessionId={teachingSession.session?.id ?? null}
            scenarioMediaIds={scenarioMediaIds}
            onScenarioMediaIdsChange={setScenarioMediaIds}
          />'''
new_top = '''          {teachingSession.role === 'candidate' && (
            <CaseMediaPanel
              role={teachingSession.role}
              sessionId={teachingSession.session?.id ?? null}
              scenarioMediaIds={scenarioMediaIds}
              onScenarioMediaIdsChange={setScenarioMediaIds}
            />
          )}'''
assert old_top in text
text = text.replace(old_top, new_top, 1)

marker = '''      <TeachingInstructorWorkspace
        role={teachingSession.role}'''
insert = '''                <TeachingMediaInstructorPanel
                  role={teachingSession.role}
                  sessionId={teachingSession.session?.id ?? null}
                  scenarioMediaIds={scenarioMediaIds}
                  onScenarioMediaIdsChange={setScenarioMediaIds}
                />
      <TeachingInstructorWorkspace
        role={teachingSession.role}'''
assert marker in text
text = text.replace(marker, insert, 1)
app.write_text(text)

index = Path('src/teaching/index.ts')
idx = index.read_text()
line = "export * from './TeachingMediaPanel'\n"
if line not in idx:
    idx += line
index.write_text(idx)

version = Path('src/appVersion.ts')
version.write_text("export const APP_VERSION = '0.82.8.1'\n")
