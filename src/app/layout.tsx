import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import HeaderNav         from '@/components/HeaderNav'
import UserMenu          from '@/components/UserMenu'
import NotificationBell  from '@/components/NotificationBell'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Household',
  description: 'Shared household app — finances, shopping & calendar.',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const profile = user
    ? await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .single()
        .then(({ data }) => data)
    : null

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {user && (
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <HeaderNav />
            <div className="flex items-center gap-3">
              <NotificationBell userId={user.id} />
              <UserMenu
                avatarUrl={profile?.avatar_url ?? null}
                displayName={profile?.display_name ?? null}
                email={user.email ?? ''}
              />
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  )
}
