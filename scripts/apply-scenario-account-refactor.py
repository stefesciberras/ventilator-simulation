from pathlib import Path

# Move instructor auth UI imports onto the shared account service.
auth = Path('src/components/InstructorAccountAuth.tsx')
text = auth.read_text()
text = text.replace("} from '../instructorAccount'", "} from '../teaching/account/InstructorAccountService'", 1)
auth.write_text(text)

# Convert instructorAccount persistence/auth implementations into compatibility delegates.
path = Path('src/instructorAccount.ts')
text = path.read_text()
text = text.replace("import type { User } from '@supabase/supabase-js'\n", '')
text = text.replace("import { supabase } from './session/supabase'\n", '')
if "createScenarioRepository" not in text:
    text = text.replace(
        "import type { ScenarioProductId } from './teaching/scenario/products'\n",
        "import type { ScenarioProductId } from './teaching/scenario/products'\nimport { createScenarioRepository } from './teaching/scenario/ScenarioRepository'\n",
    )

marker = 'export function isPermanentInstructor('
idx = text.find(marker)
if idx < 0:
    raise RuntimeError('auth marker not found')
text = text[:idx].rstrip() + '''\n\n/**\n * Compatibility exports. Instructor identity is owned by EDUSIM teaching core.\n */\nexport {\n  isPermanentInstructor,\n  getInstructorAccount,\n  subscribeToInstructorAccount,\n  signInInstructor,\n  createInstructorAccount,\n  signOutInstructor,\n} from './teaching/account/InstructorAccountService'\n\nfunction legacyScenarioRepository(product: ScenarioProductId) {\n  return createScenarioRepository<InstructorScenarioSnapshot>(product, product === 'eduvent' ? {\n    encode: normaliseScenario,\n    decode: (scenario) => normaliseScenario(scenario as InstructorScenarioSnapshot),\n  } : {})\n}\n\n/** @deprecated Use createScenarioRepository/useProductScenarioLibrary. */\nexport async function listInstructorPresets(product: ScenarioProductId = 'eduvent'): Promise<InstructorPresetRow[]> {\n  const rows = await legacyScenarioRepository(product).list()\n  return rows as InstructorPresetRow[]\n}\n\n/** @deprecated Use createScenarioRepository/useProductScenarioLibrary. */\nexport async function createInstructorPreset(name: string, scenario: InstructorScenarioSnapshot, product: ScenarioProductId = 'eduvent') {\n  return legacyScenarioRepository(product).create(name, scenario) as Promise<InstructorPresetRow>\n}\n\n/** @deprecated Use createScenarioRepository/useProductScenarioLibrary. */\nexport async function updateInstructorPreset(\n  id: string,\n  updates: { name?: string; scenario?: InstructorScenarioSnapshot },\n  product: ScenarioProductId = 'eduvent',\n) {\n  return legacyScenarioRepository(product).update(id, updates) as Promise<InstructorPresetRow>\n}\n\n/** @deprecated Use createScenarioRepository/useProductScenarioLibrary. */\nexport async function deleteInstructorPreset(id: string, product: ScenarioProductId = 'eduvent') {\n  return legacyScenarioRepository(product).remove(id)\n}\n'''
path.write_text(text)

# Preserve compatibility aliases now owned by scenario core.
runtime = Path('src/teaching/scenario/runtimeCore.ts')
text = runtime.read_text()
text = text.replace('  ScenarioQuestionContent,\n', '  ScenarioQuestionContent,\n  ScenarioQuestionOption,\n')
text = text.replace('export type TeachingScenarioQuestionContent = ScenarioQuestionContent\n', 'export type TeachingScenarioQuestionContent = ScenarioQuestionContent\nexport type TeachingScenarioQuestionOption = ScenarioQuestionOption\n')
runtime.write_text(text)

authoring = Path('src/teaching/scenario/authoringTypes.ts')
text = authoring.read_text()
text = text.replace('  ScenarioQuestionContent,\n', '  ScenarioQuestionContent,\n  ScenarioQuestionOption,\n')
text = text.replace('export type SharedScenarioQuestionContent = ScenarioQuestionContent\n', 'export type SharedScenarioQuestionContent = ScenarioQuestionContent\nexport type SharedScenarioQuestionOption = ScenarioQuestionOption\n')
authoring.write_text(text)

print('Applied scenario/account core refactor')
