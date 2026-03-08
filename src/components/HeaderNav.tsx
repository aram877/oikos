'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ── Nav structure ─────────────────────────────────────────────────────────── //

type FlatLink  = { kind: 'link';  label: string; href: string }
type GroupLink = { kind: 'group'; label: string; items: { href: string; label: string }[] }
type NavEntry  = FlatLink | GroupLink

const NAV: NavEntry[] = [
  {
    kind:  'group',
    label: 'Finance',
    items: [
      { href: '/dashboard',    label: 'Overview'     },
      { href: '/transactions', label: 'Transactions' },
    ],
  },
  {
    kind:  'group',
    label: 'Kitchen',
    items: [
      { href: '/shopping',     label: 'Shopping'     },
      { href: '/meal-plan',    label: 'Meal Plan'    },
      { href: '/meal-library', label: 'Meal Library' },
    ],
  },
  { kind: 'link', label: 'Calendar', href: '/calendar' },
]

// ── Component ─────────────────────────────────────────────────────────────── //

export default function HeaderNav() {
  const pathname                    = usePathname()
  const [openGroup, setOpenGroup]   = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navRef                      = useRef<HTMLElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null)
        setMobileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close everything on route change
  useEffect(() => {
    setOpenGroup(null)
    setMobileOpen(false)
  }, [pathname])

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  function groupIsActive(items: { href: string }[]) {
    return items.some((i) => isActive(i.href))
  }

  return (
    <nav ref={navRef} className="relative text-sm">

      {/* ── Desktop ─────────────────────────────────────────────────────── */}
      <div className="hidden sm:flex items-center gap-1">
        {NAV.map((entry) => {
          if (entry.kind === 'link') {
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className={`rounded px-3 py-1.5 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100 ${
                  isActive(entry.href)
                    ? 'font-medium text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {entry.label}
              </Link>
            )
          }

          const active = groupIsActive(entry.items)
          const open   = openGroup === entry.label

          return (
            <div key={entry.label} className="relative">
              <button
                onClick={() => setOpenGroup(open ? null : entry.label)}
                className={`flex items-center gap-1 rounded px-3 py-1.5 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100 ${
                  active ? 'font-medium text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {entry.label}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
                >
                  <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {open && (
                <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 z-50">
                  {entry.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-4 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                        isActive(item.href)
                          ? 'font-medium text-neutral-900 dark:text-neutral-100'
                          : 'text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Mobile hamburger ────────────────────────────────────────────── */}
      <div className="sm:hidden">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          className="flex h-8 w-8 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {mobileOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M2 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4Zm0 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 12Z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {mobileOpen && (
          <div className="absolute left-0 top-full mt-2 w-52 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 z-50">
            {NAV.map((entry) => {
              if (entry.kind === 'link') {
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className={`block px-4 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                      isActive(entry.href)
                        ? 'font-medium text-neutral-900 dark:text-neutral-100'
                        : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {entry.label}
                  </Link>
                )
              }

              return (
                <div key={entry.label}>
                  <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {entry.label}
                  </p>
                  {entry.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-6 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                        isActive(item.href)
                          ? 'font-medium text-neutral-900 dark:text-neutral-100'
                          : 'text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </nav>
  )
}
