import type { ProfileRow, UpdateProfileInput } from '../types'
import { getSupabase } from '../supabase'

/**
 * Returns the current user's profile row, or null if not yet created.
 */
export async function getProfile(): Promise<ProfileRow | null> {
  const supabase = getSupabase()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('[profileRepo.getProfile] No authenticated user')

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, date_of_birth, avatar_url, updated_at')
    .eq('id', userId)
    .single()

  if (error) {
    // PGRST116 = row not found — return null instead of throwing
    if (error.code === 'PGRST116') return null
    throw new Error(`[profileRepo.getProfile] ${error.message}`)
  }
  return data as ProfileRow
}

/**
 * Creates or updates the current user's profile row.
 */
export async function upsertProfile(input: UpdateProfileInput): Promise<ProfileRow> {
  const supabase = getSupabase()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('[profileRepo.upsertProfile] No authenticated user')

  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      ...input,
      updated_at: new Date().toISOString(),
    })
    .select('id, display_name, date_of_birth, avatar_url, updated_at')
    .single()

  if (error) throw new Error(`[profileRepo.upsertProfile] ${error.message}`)
  if (!data) throw new Error('[profileRepo.upsertProfile] No row returned')
  return data as ProfileRow
}

/**
 * Uploads an avatar image to the avatars bucket and returns the public URL
 * with a cache-busting timestamp query param.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const supabase = getSupabase()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('[profileRepo.uploadAvatar] No authenticated user')

  const path = `${userId}/avatar`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true })

  if (uploadError) throw new Error(`[profileRepo.uploadAvatar] ${uploadError.message}`)

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${urlData.publicUrl}?t=${Date.now()}`
}
