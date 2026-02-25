import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

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

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {user && (
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/transactions" className="hover:text-neutral-800 dark:hover:text-neutral-200">Finance</Link>
              <Link href="/shopping"     className="hover:text-neutral-800 dark:hover:text-neutral-200">Shopping</Link>
              <Link href="/calendar"     className="hover:text-neutral-800 dark:hover:text-neutral-200">Calendar</Link>
            </nav>
            <div className="flex items-center gap-3">
              <span>{user.email}</span>
              <LogoutButton />
            </div>
          </header>
        )}
        {children}
      </body>
    </html>
  )
}
