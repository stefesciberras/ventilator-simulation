import fs from 'node:fs'

const path = 'src/teaching/repository.ts'
let source = fs.readFileSync(path, 'utf8')
const from = `export async function listTeachingLibraryItems(environmentId: string): Promise<TeachingLibraryItem[]> {
  const user = await requirePermanentTeachingAuthor()
  const { data, error } = await supabase
    .from('teaching_library_items')
    .select('*')
    .eq('owner_id', user.id)
    .overlaps('environments', ['all', environmentId])
    .order('updated_at', { ascending: false })`
const to = `export async function listTeachingLibraryItems(environmentId?: string): Promise<TeachingLibraryItem[]> {
  const user = await requirePermanentTeachingAuthor()
  let query = supabase
    .from('teaching_library_items')
    .select('*')
    .eq('owner_id', user.id)
  if (environmentId) query = query.overlaps('environments', ['all', environmentId])
  const { data, error } = await query.order('updated_at', { ascending: false })`
if (!source.includes(from)) throw new Error('Generated filtered library query not found')
source = source.replace(from, to)
fs.writeFileSync(path, source)
console.log('generic scenario-builder library access preserved')
