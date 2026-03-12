'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { clearAccountCache } from '@/db/accountContext'
import { Separator } from '@/components/ui/separator'

interface Props {
  avatarUrl:   string | null
  displayName: string | null
  email:       string
}

export default function UserMenu({ avatarUrl, displayName, email }: Props) {
  const [open,           setOpen]           = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmSignOut(false)
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
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-2 rounded-full p-0.5 transition-all hover:ring-2 hover:ring-border"
        aria-label="User menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} className="h-8 w-8 rounded-full object-cover" alt="" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
            {initial}
          </span>
        )}
        <span className="hidden sm:inline text-sm text-foreground pr-1">{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card py-1.5 shadow-md z-50">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-muted-foreground shrink-0">
              <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
            </svg>
            Profile
          </Link>
          <Link
            href="/household"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-muted-foreground shrink-0">
              <path d="M8.543 2.232a.75.75 0 0 0-1.085 0l-5.25 5.5A.75.75 0 0 0 2.75 9H4v4.75A.25.25 0 0 0 4.25 14h3.5a.25.25 0 0 0 .25-.25v-2.5a.25.25 0 0 1 .25-.25h1.5a.25.25 0 0 1 .25.25v2.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25V9h1.25a.75.75 0 0 0 .543-1.268l-5.25-5.5Z" />
            </svg>
            Household
          </Link>
          <div className="my-1 px-2">
            <Separator />
          </div>
          {confirmSignOut ? (
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="text-xs text-muted-foreground">Sign out?</span>
              <button
                onClick={handleSignOut}
                className="text-xs font-medium text-destructive hover:text-destructive/80 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmSignOut(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmSignOut(true)}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0">
                <path fillRule="evenodd" d="M2 4.75A2.75 2.75 0 0 1 4.75 2h3a2.75 2.75 0 0 1 2.75 2.75v.5a.75.75 0 0 1-1.5 0v-.5c0-.69-.56-1.25-1.25-1.25h-3c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h3c.69 0 1.25-.56 1.25-1.25v-.5a.75.75 0 0 1 1.5 0v.5A2.75 2.75 0 0 1 7.75 14h-3A2.75 2.75 0 0 1 2 11.25v-6.5Zm9.47.47a.75.75 0 0 1 1.06 0l2.25 2.25a.75.75 0 0 1 0 1.06l-2.25 2.25a.75.75 0 1 1-1.06-1.06l.97-.97H6.75a.75.75 0 0 1 0-1.5h5.69l-.97-.97a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  )
}
