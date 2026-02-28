'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { clearAccountCache } from '@/db/accountContext'

interface Props {
  avatarUrl:   string | null
  displayName: string | null
  email:       string
}

export default function UserMenu({ avatarUrl, displayName, email }: Props) {
  const [open, setOpen] = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleSignOut() {
    setOpen(false)
    clearAccountCache()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initial = (displayName ?? email ?? '?')[0].toUpperCase()
  const label   = displayName ?? email

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 hover:opacity-75 transition-opacity"
        aria-label="User menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} className="h-7 w-7 rounded-full object-cover" alt="" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold dark:bg-neutral-700">
            {initial}
          </span>
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 z-50">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Profile
          </Link>
          <Link
            href="/household"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Household
          </Link>
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          <button
            onClick={handleSignOut}
            className="block w-full px-4 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
