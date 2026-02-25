'use client'

import { useState, useEffect, useCallback } from 'react'
import { dbClient } from '@/db/db.client'
import type { ProfileRow, UpdateProfileInput } from '@/db/types'

type Status = 'loading' | 'loaded' | 'error'

export function useProfile() {
  const [profile,   setProfile]   = useState<ProfileRow | null>(null)
  const [status,    setStatus]    = useState<Status>('loading')
  const [saving,    setSaving]    = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    dbClient.profile.get()
      .then(p  => { setProfile(p); setStatus('loaded') })
      .catch(e => { setError(String(e)); setStatus('error') })
  }, [])

  const save = useCallback(async (input: UpdateProfileInput) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await dbClient.profile.upsert(input)
      setProfile(updated)
    } catch (e) {
      setError(String(e))
      throw e
    } finally {
      setSaving(false)
    }
  }, [])

  const handleAvatarChange = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const avatarUrl = await dbClient.profile.uploadAvatar(file)
      const updated   = await dbClient.profile.upsert({ avatar_url: avatarUrl })
      setProfile(updated)
    } catch (e) {
      setError(String(e))
      throw e
    } finally {
      setUploading(false)
    }
  }, [])

  return { profile, status, saving, uploading, error, save, handleAvatarChange }
}
