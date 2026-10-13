import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './session/supabase'

export const CASE_MEDIA_BUCKET = 'case-media'
export const CASE_MEDIA_MAX_BYTES = 25 * 1024 * 1024

export type CaseMediaKind = 'image' | 'video'

export interface CaseMediaRow {
  id: string
  instructor_id: string
  storage_path: string
  file_name: string
  title: string
  media_kind: CaseMediaKind
  mime_type: string
  size_bytes: number
  created_at: string
  updated_at: string
}

export interface SessionCaseMediaRow {
  session_id: string
  media_id: string
  released: boolean
  sort_order: number
  added_at: string
  released_at: string | null
  media: CaseMediaRow
}

const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

function mediaKindForMime(mimeType: string): CaseMediaKind | null {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return null
}

function cleanFileName(fileName: string) {
  const compact = fileName.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return compact.slice(-120) || 'media'
}

async function requirePermanentInstructor() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const user = data.user
  const anonymous = Boolean((user as typeof user & { is_anonymous?: boolean } | null)?.is_anonymous)
  if (!user || anonymous || !user.email) throw new Error('Sign in to an instructor cloud account to use case media.')
  return user
}

export async function listInstructorCaseMedia(): Promise<CaseMediaRow[]> {
  const user = await requirePermanentInstructor()
  const { data, error } = await supabase
    .from('case_media')
    .select('*')
    .eq('instructor_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CaseMediaRow[]
}

export async function listCaseMediaByIds(ids: string[]): Promise<CaseMediaRow[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return []
  const { data, error } = await supabase
    .from('case_media')
    .select('*')
    .in('id', unique)
  if (error) throw error
  const rows = (data ?? []) as CaseMediaRow[]
  const order = new Map(unique.map((id, index) => [id, index]))
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export async function uploadCaseMedia(file: File, title?: string): Promise<CaseMediaRow> {
  const kind = mediaKindForMime(file.type)
  if (!kind || !ACCEPTED_MIME_TYPES.has(file.type)) {
    throw new Error('Use a JPEG, PNG, WebP, GIF, MP4, WebM or QuickTime file.')
  }
  if (file.size <= 0) throw new Error('The selected file is empty.')
  if (file.size > CASE_MEDIA_MAX_BYTES) throw new Error('Case media files are limited to 25 MB each.')

  const user = await requirePermanentInstructor()
  const id = crypto.randomUUID()
  const safeName = cleanFileName(file.name)
  const storagePath = `${user.id}/${id}/${safeName}`
  const cleanTitle = (title?.trim() || file.name.replace(/\.[^.]+$/, '') || 'Case media').slice(0, 120)

  const { error: uploadError } = await supabase.storage
    .from(CASE_MEDIA_BUCKET)
    .upload(storagePath, file, { cacheControl: '3600', contentType: file.type, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('case_media')
    .insert({
      id,
      instructor_id: user.id,
      storage_path: storagePath,
      file_name: file.name,
      title: cleanTitle,
      media_kind: kind,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select('*')
    .single()

  if (error) {
    await supabase.storage.from(CASE_MEDIA_BUCKET).remove([storagePath]).catch(() => undefined)
    throw error
  }
  return data as CaseMediaRow
}

export async function updateCaseMediaTitle(id: string, title: string): Promise<CaseMediaRow> {
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new Error('Enter a media title.')
  const user = await requirePermanentInstructor()
  const { data, error } = await supabase
    .from('case_media')
    .update({ title: cleanTitle.slice(0, 120), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('instructor_id', user.id)
    .select('*')
    .single()
  if (error) throw error
  return data as CaseMediaRow
}

export async function deleteCaseMedia(media: CaseMediaRow) {
  const user = await requirePermanentInstructor()
  if (media.instructor_id !== user.id) throw new Error('You can only delete your own case media.')
  const { error: storageError } = await supabase.storage.from(CASE_MEDIA_BUCKET).remove([media.storage_path])
  if (storageError) throw storageError
  const { error } = await supabase
    .from('case_media')
    .delete()
    .eq('id', media.id)
    .eq('instructor_id', user.id)
  if (error) throw error
}

export async function listSessionCaseMedia(sessionId: string): Promise<SessionCaseMediaRow[]> {
  const { data, error } = await supabase
    .from('teaching_session_media')
    .select('session_id, media_id, released, sort_order, added_at, released_at, media:case_media(*)')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true })
    .order('added_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as SessionCaseMediaRow[]).filter((row) => Boolean(row.media))
}

export async function releaseSessionCaseMedia(sessionId: string, mediaId: string, sortOrder = 0) {
  const { data, error } = await supabase
    .from('teaching_session_media')
    .upsert({
      session_id: sessionId,
      media_id: mediaId,
      released: true,
      sort_order: sortOrder,
      released_at: new Date().toISOString(),
    }, { onConflict: 'session_id,media_id' })
    .select('session_id, media_id, released, sort_order, added_at, released_at, media:case_media(*)')
    .single()
  if (error) throw error
  return data as unknown as SessionCaseMediaRow
}

export async function withdrawSessionCaseMedia(sessionId: string, mediaId: string) {
  const { data, error } = await supabase
    .from('teaching_session_media')
    .update({ released: false, released_at: null })
    .eq('session_id', sessionId)
    .eq('media_id', mediaId)
    .select('session_id, media_id, released, sort_order, added_at, released_at, media:case_media(*)')
    .single()
  if (error) throw error
  return data as unknown as SessionCaseMediaRow
}

export async function createCaseMediaSignedUrl(storagePath: string, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from(CASE_MEDIA_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

export function subscribeToSessionCaseMedia(sessionId: string, onChange: () => void): RealtimeChannel {
  const instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return supabase
    .channel(`eduvent-case-media-${sessionId}-${instanceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'teaching_session_media',
        filter: `session_id=eq.${sessionId}`,
      },
      () => onChange(),
    )
    .subscribe()
}

export async function closeCaseMediaChannel(channel: RealtimeChannel | null) {
  if (!channel) return
  await supabase.removeChannel(channel)
}
