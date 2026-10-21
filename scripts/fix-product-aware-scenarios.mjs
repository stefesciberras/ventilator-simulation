import fs from 'node:fs'

const path = 'src/instructorAccount.ts'
let text = fs.readFileSync(path, 'utf8')
text = text.replace('  product: ScenarioProductId\n  name: string', '  product?: ScenarioProductId\n  name: string')
fs.writeFileSync(path, text)

const editorPath = 'src/scenario-builder/modules/edumon/EdumonScenarioEditor.tsx'
let editor = fs.readFileSync(editorPath, 'utf8')
editor = editor.replace('const updatePatient = <K extends keyof MonitorPatientState>(', 'const updatePatient = <K extends keyof MonitorPatientState,>(')
fs.writeFileSync(editorPath, editor)
