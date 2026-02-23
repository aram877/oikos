'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { clearAccountCache } from '@/db/accountContext'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    clearAccountCache()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
    >
      Sign out
    </button>
  )
}
