import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import HeaderNav         from '@/components/HeaderNav'
import UserMenu          from '@/components/UserMenu'
import NotificationBell  from '@/components/NotificationBell'
import ThemeToggle       from '@/components/ThemeToggle'
import PrivacyToggle     from '@/components/PrivacyToggle'
import PwaInit           from '@/components/PwaInit'
import OikosLogo         from '@/components/OikosLogo'
import ErrorBoundary     from '@/components/ErrorBoundary'
import { PrivacyProvider } from '@/lib/privacy'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

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
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PrivacyProvider>
          {user && (
            <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 text-sm shadow-sm">
              <div className="flex items-center gap-4">
                <OikosLogo linked />
                <HeaderNav />
              </div>
              <div className="flex items-center gap-3">
                <PrivacyToggle />
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
          <ErrorBoundary>{children}</ErrorBoundary>
          <PwaInit />
        </PrivacyProvider>
      </body>
    </html>
  )
}
