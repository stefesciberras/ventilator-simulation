import fs from 'node:fs'

function edit(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) throw new Error(`No change made to ${path}`)
  fs.writeFileSync(path, after)
}
function replace(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label ?? from.slice(0, 80)}`)
  return text.replace(from, to)
}

edit('src/teaching/types.ts', (s) => {
  s = replace(s, "  tags: string[]\n  created_at: string", "  tags: string[]\n  environments: string[]\n  created_at: string", 'library item environments')
  s = replace(s, "  module: string\n  tags?: string[]", "  module: string\n  environments?: string[]\n  tags?: string[]", 'library draft environments')
  s = replace(s, "  defaultModule: string\n  getContext?", "  defaultModule: string\n  libraryEnvironmentId: string\n  getContext?", 'host environment')
  return s
})

edit('src/teaching/hosts/eduvent.ts', (s) => replace(s, "  defaultModule: 'Ventilation',", "  defaultModule: 'Ventilation',\n  libraryEnvironmentId: 'mechanical-ventilation',", 'eduvent environment'))
edit('src/teaching/hosts/edumon.ts', (s) => {
  s = replace(s, "  defaultModule: 'Anaesthesia monitoring',", "  defaultModule: 'Anaesthesia monitoring',\n  libraryEnvironmentId: 'anaesthesia',", 'ana environment')
  s = replace(s, "  defaultModule: 'Intensive care monitoring',", "  defaultModule: 'Intensive care monitoring',\n  libraryEnvironmentId: 'itu',", 'itu environment')
  return s
})

edit('src/teaching/repository.ts', (s) => {
  s = replace(s, "export async function listTeachingLibraryItems(): Promise<TeachingLibraryItem[]> {\n  const user = await requirePermanentTeachingAuthor()\n  const { data, error } = await supabase\n    .from('teaching_library_items')\n    .select('*')\n    .eq('owner_id', user.id)\n    .order('updated_at', { ascending: false })", "export async function listTeachingLibraryItems(environmentId: string): Promise<TeachingLibraryItem[]> {\n  const user = await requirePermanentTeachingAuthor()\n  const { data, error } = await supabase\n    .from('teaching_library_items')\n    .select('*')\n    .eq('owner_id', user.id)\n    .overlaps('environments', ['all', environmentId])\n    .order('updated_at', { ascending: false })", 'filtered question query')
  const createNeedle = "      module: draft.module.trim() || 'General',\n      kind: draft.kind,"
  s = replace(s, createNeedle, "      module: draft.module.trim() || 'General',\n      environments: draft.environments?.length ? draft.environments : ['all'],\n      kind: draft.kind,", 'question create environments')
  s = replace(s, createNeedle, "      module: draft.module.trim() || 'General',\n      environments: draft.environments?.length ? draft.environments : ['all'],\n      kind: draft.kind,", 'question update environments')
  return s
})

edit('src/teaching/useTeachingInteractions.ts', (s) => {
  s = replace(s, "      setItems(await listTeachingLibraryItems())", "      setItems(await listTeachingLibraryItems(host.libraryEnvironmentId))", 'filtered question refresh')
  s = replace(s, "  }, [])\n\n  const save = async (draft: TeachingLibraryDraft", "  }, [host.libraryEnvironmentId])\n\n  const save = async (draft: TeachingLibraryDraft", 'question hook dependency')
  return s
})

edit('src/teaching/TeachingWorkspace.tsx', (s) => {
  s = replace(s, "import type {\n", "import { TeachingEnvironmentSelector } from './TeachingEnvironmentSelector'\nimport { teachingEnvironmentLabel } from './environments'\nimport type {\n", 'environment imports')
  s = replace(s, "    tags: item.tags.join(', '),\n    correctOptionId", "    tags: item.tags.join(', '),\n    environments: item.environments,\n    correctOptionId", 'draft environment')
  s = replace(s, "  const [tags, setTags] = useState('')\n  const [editingLibraryId", "  const [tags, setTags] = useState('')\n  const [environments, setEnvironments] = useState<string[]>([host.libraryEnvironmentId])\n  const [editingLibraryId", 'environment state')
  s = replace(s, "    setTags('')\n    setEditingLibraryId", "    setTags('')\n    setEnvironments([host.libraryEnvironmentId])\n    setEditingLibraryId", 'reset environments')
  s = replace(s, "    setTags(draft.tags)\n    setEditingLibraryId", "    setTags(draft.tags)\n    setEnvironments(draft.environments)\n    setEditingLibraryId", 'load environments')
  s = replace(s, "      module: module.trim() || host.defaultModule,\n      tags:", "      module: module.trim() || host.defaultModule,\n      environments,\n      tags:", 'save environments')
  s = replace(s, "              <label>Tags <span>(optional)</span><input value={tags} maxLength={300} onChange={(event) => setTags(event.target.value)} placeholder=\"e.g. COPD, AutoPEEP, waveforms\" /></label>\n              <label>Title", "              <label>Tags <span>(optional)</span><input value={tags} maxLength={300} onChange={(event) => setTags(event.target.value)} placeholder=\"e.g. COPD, AutoPEEP, waveforms\" /></label>\n              <TeachingEnvironmentSelector value={environments} onChange={setEnvironments} />\n              <label>Title", 'question selector')
  s = replace(s, "                          {item.tags.length > 0 && <div className=\"teaching-library-tags\">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}", "                          <div className=\"teaching-library-environments\">{item.environments.map((environment) => <span key={environment}>{teachingEnvironmentLabel(environment)}</span>)}</div>\n                          {item.tags.length > 0 && <div className=\"teaching-library-tags\">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}", 'question environment badges')
  return s
})

edit('src/caseMedia.ts', (s) => {
  s = replace(s, "  size_bytes: number\n  created_at", "  size_bytes: number\n  environments: string[]\n  created_at", 'media row environments')
  s = replace(s, "export async function listInstructorCaseMedia(): Promise<CaseMediaRow[]> {\n  const user = await requirePermanentInstructor()\n  const { data, error } = await supabase\n    .from('case_media')\n    .select('*')\n    .eq('instructor_id', user.id)\n    .order('created_at', { ascending: false })", "export async function listInstructorCaseMedia(environmentId?: string): Promise<CaseMediaRow[]> {\n  const user = await requirePermanentInstructor()\n  let query = supabase\n    .from('case_media')\n    .select('*')\n    .eq('instructor_id', user.id)\n  if (environmentId) query = query.overlaps('environments', ['all', environmentId])\n  const { data, error } = await query.order('created_at', { ascending: false })", 'filtered media query')
  s = replace(s, "export async function uploadCaseMedia(file: File, title?: string): Promise<CaseMediaRow> {", "export async function uploadCaseMedia(file: File, title?: string, environments: string[] = ['all']): Promise<CaseMediaRow> {", 'upload environments signature')
  s = replace(s, "      size_bytes: file.size,\n    })", "      size_bytes: file.size,\n      environments: environments.length ? environments : ['all'],\n    })", 'upload environments insert')
  s = replace(s, "export async function updateCaseMediaTitle(id: string, title: string): Promise<CaseMediaRow> {", "export async function updateCaseMediaEnvironments(id: string, environments: string[]): Promise<CaseMediaRow> {\n  const user = await requirePermanentInstructor()\n  const { data, error } = await supabase\n    .from('case_media')\n    .update({ environments: environments.length ? environments : ['all'], updated_at: new Date().toISOString() })\n    .eq('id', id)\n    .eq('instructor_id', user.id)\n    .select('*')\n    .single()\n  if (error) throw error\n  return data as CaseMediaRow\n}\n\nexport async function updateCaseMediaTitle(id: string, title: string): Promise<CaseMediaRow> {", 'media environment updater')
  return s
})

edit('src/teaching/SharedTeachingTab.tsx', (s) => replace(s, "            instructorAuthenticated={instructorAuthenticated}\n            sessionId={sessionId}", "            instructorAuthenticated={instructorAuthenticated}\n            environmentId={host.libraryEnvironmentId}\n            sessionId={sessionId}", 'media host environment'))

edit('src/teaching/TeachingMediaPanel.tsx', (s) => {
  s = replace(s, "  uploadCaseMedia,\n  withdrawSessionCaseMedia,", "  uploadCaseMedia,\n  updateCaseMediaEnvironments,\n  withdrawSessionCaseMedia,", 'media updater import')
  s = replace(s, "import type { TeachingRole } from './types'", "import type { TeachingRole } from './types'\nimport { TeachingEnvironmentSelector } from './TeachingEnvironmentSelector'\nimport { teachingEnvironmentLabel } from './environments'", 'media category imports')
  s = replace(s, "  instructorAuthenticated: boolean\n  sessionId:", "  instructorAuthenticated: boolean\n  environmentId: string\n  sessionId:", 'media environment prop')
  s = replace(s, "export function TeachingMediaInstructorPanel({ role, instructorAuthenticated, sessionId, scenarioMediaIds, onScenarioMediaIdsChange }: TeachingMediaInstructorPanelProps) {", "export function TeachingMediaInstructorPanel({ role, instructorAuthenticated, environmentId, sessionId, scenarioMediaIds, onScenarioMediaIdsChange }: TeachingMediaInstructorPanelProps) {", 'media destructure')
  s = replace(s, "  const [uploadTitle, setUploadTitle] = useState('')", "  const [uploadTitle, setUploadTitle] = useState('')\n  const [uploadEnvironments, setUploadEnvironments] = useState<string[]>([environmentId])", 'media upload categories')
  s = replace(s, "      const media = await listInstructorCaseMedia()", "      const media = await listInstructorCaseMedia(environmentId)", 'media filtered refresh')
  s = replace(s, "  }, [role, instructorAuthenticated, selectedId, sessionId])", "  }, [role, instructorAuthenticated, selectedId, sessionId, environmentId])", 'media refresh dependency')
  s = replace(s, "      const media = await uploadCaseMedia(file, uploadTitle)\n      setUploadTitle('')", "      const media = await uploadCaseMedia(file, uploadTitle, uploadEnvironments)\n      setUploadTitle('')\n      setUploadEnvironments([environmentId])", 'media upload values')
  s = replace(s, "  const present = async (media: CaseMediaRow) => {", "  const changeEnvironments = async (media: CaseMediaRow, environments: string[]) => {\n    setBusy(true); setError(null); setMessage(null)\n    try {\n      await updateCaseMediaEnvironments(media.id, environments)\n      setMessage(`Updated categories for “${media.title}”.`)\n      await refresh()\n    } catch (cause) {\n      setError(cause instanceof Error ? cause.message : 'Unable to update media categories.')\n    } finally { setBusy(false) }\n  }\n\n  const present = async (media: CaseMediaRow) => {", 'media change categories')
  s = replace(s, "          <div className=\"teaching-media-upload-row\">", "          <TeachingEnvironmentSelector value={uploadEnvironments} onChange={setUploadEnvironments} disabled={working} label=\"New media categories\" />\n          <div className=\"teaching-media-upload-row\">", 'media upload selector')
  s = replace(s, "                      <small>{media.media_kind === 'video' ? 'Video' : 'Image'} · {fileSizeLabel(media.size_bytes)}</small>", "                      <small>{media.media_kind === 'video' ? 'Video' : 'Image'} · {fileSizeLabel(media.size_bytes)}</small>\n                      <span className=\"teaching-media-environments\">{media.environments.map((environment) => teachingEnvironmentLabel(environment)).join(' · ')}</span>", 'media categories label')
  s = replace(s, "          {selected && (\n            <div className=\"teaching-media-actions\"", "          {selected && (\n            <div className=\"teaching-media-selected-categories\">\n              <TeachingEnvironmentSelector value={selected.environments} onChange={(next) => void changeEnvironments(selected, next)} disabled={working} label=\"Media categories\" />\n            </div>\n          )}\n\n          {selected && (\n            <div className=\"teaching-media-actions\"", 'selected media categories')
  return s
})

edit('src/teaching/teaching.css', (s) => s + `\n\n/* Shared teaching-library environment categories */\n.teaching-environment-selector{min-width:0;margin:0;padding:9px 10px;border:1px solid #354a54;border-radius:8px;background:#0d171c}\n.teaching-environment-selector legend{padding:0 5px;color:#b8c6cc;font-size:.78rem;font-weight:700}\n.teaching-environment-options{display:flex;flex-wrap:wrap;gap:6px}\n.teaching-environment-options label{display:inline-flex;align-items:center;gap:6px;border:1px solid #40545f;border-radius:999px;background:#16242b;color:#b9c9cf;padding:5px 9px;font-size:.76rem;cursor:pointer}\n.teaching-environment-options label.selected{border-color:#ef8a27;background:#30261b;color:#fff}\n.teaching-environment-options input{width:auto!important;margin:0;accent-color:#ef8a27}\n.teaching-environment-selector>small{display:block;margin-top:6px;color:#81949d;font-size:.7rem}\n.teaching-library-environments{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0}\n.teaching-library-environments span{padding:3px 6px;border-radius:999px;background:#283922;color:#bcd6aa;font-size:.68rem}\n`)

edit('src/teaching/TeachingMediaPanel.css', (s) => s + `\n.teaching-media-environments{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a9bd93;font-size:.66rem}\n.teaching-media-selected-categories{min-width:0}\n`)

edit('src/teaching/index.ts', (s) => s + "export * from './environments'\nexport * from './TeachingEnvironmentSelector'\n")

console.log('teaching library environment categories implemented')
