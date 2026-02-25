'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from './_hooks/useProfile'

export default function ProfilePage() {
  const { profile, status, saving, uploading, error, save, handleAvatarChange } = useProfile()

  const [displayName,  setDisplayName]  = useState('')
  const [dateOfBirth,  setDateOfBirth]  = useState('')
  const [savedMessage, setSavedMessage] = useState(false)
  const [userEmail,    setUserEmail]    = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name  ?? '')
      setDateOfBirth(profile.date_of_birth ?? '')
    }
  }, [profile])

  // Get current user's email
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [])

  const initials = (displayName || userEmail || '?')[0].toUpperCase()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    try {
      await save({
        display_name:  displayName  || null,
        date_of_birth: dateOfBirth  || null,
      })
      setSavedMessage(true)
      setTimeout(() => setSavedMessage(false), 3000)
    } catch {
      // error already set in hook
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleAvatarChange(file)
    // reset so picking same file again still fires change event
    e.target.value = ''
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-8 text-xl font-semibold text-neutral-800 dark:text-neutral-100">
        Profile
      </h1>

      {status === 'loading' && (
        <p className="text-sm text-neutral-400">Loading…</p>
      )}

      {status !== 'loading' && (
        <>
          {/* Avatar */}
          <div className="mb-8 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative cursor-pointer overflow-hidden rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              title="Change photo"
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-200 text-2xl font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                  {initials}
                </span>
              )}
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs text-white">
                  Uploading…
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              Change photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="flex flex-col gap-5">
            {/* Email (read-only) */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Email
              </label>
              <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                {userEmail ?? '—'}
              </p>
            </div>

            {/* Display name */}
            <div className="flex flex-col gap-1">
              <label htmlFor="display-name" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Display name
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </div>

            {/* Date of birth */}
            <div className="flex flex-col gap-1">
              <label htmlFor="date-of-birth" className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Date of birth
              </label>
              <input
                id="date-of-birth"
                type="date"
                value={dateOfBirth}
                onChange={e => setDateOfBirth(e.target.value)}
                className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {savedMessage && (
                <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>
              )}
              {error && (
                <span className="text-sm text-red-500">{error}</span>
              )}
            </div>
          </form>
        </>
      )}
    </main>
  )
}
