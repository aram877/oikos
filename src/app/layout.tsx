import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import HeaderNav         from '@/components/HeaderNav'
import UserMenu          from '@/components/UserMenu'
import NotificationBell  from '@/components/NotificationBell'
import ThemeToggle       from '@/components/ThemeToggle'
import PwaInit           from '@/components/PwaInit'
import OikosLogo         from '@/components/OikosLogo'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    template: '%s | Oikos',
    default:  'Oikos',
  },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}})()` }} />
        <meta name="theme-color" content="#a16207" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {user && (
          <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 text-sm shadow-sm">
            <div className="flex items-center gap-4">
              <OikosLogo linked />
              <HeaderNav />
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
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
        <PwaInit />
      </body>
    </html>
  )
}
