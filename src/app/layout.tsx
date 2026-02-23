import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
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
  title: 'My Financial Tracker',
  description: 'Personal finance tracker — private by default.',
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
            <span>{user.email}</span>
            <LogoutButton />
          </header>
        )}
        {children}
      </body>
    </html>
  )
}
