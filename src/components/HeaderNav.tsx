'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard',    label: 'Overview'  },
  { href: '/transactions', label: 'Finance'   },
  { href: '/shopping',     label: 'Shopping'  },
  { href: '/calendar',     label: 'Calendar'  },
]

export default function HeaderNav() {
  const [open, setOpen] = useState(false)
  const pathname        = usePathname()
  const ref             = useRef<HTMLDivElement>(null)

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

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const linkClass = (href: string) =>
    `hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors ${
      isActive(href) ? 'text-neutral-900 font-medium dark:text-neutral-100' : ''
    }`

  return (
    <>
      {/* Desktop nav — hidden on mobile */}
      <nav className="hidden sm:flex items-center gap-4 text-sm">
        {NAV_LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className={linkClass(href)}>
            {label}
          </Link>
        ))}
      </nav>

      {/* Mobile hamburger — hidden on desktop */}
      <div ref={ref} className="relative sm:hidden">
        <button
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="flex h-8 w-8 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {open ? (
            /* X icon */
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          ) : (
            /* Hamburger icon */
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M2 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4Zm0 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 12Z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-2 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 z-50">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                  isActive(href)
                    ? 'font-medium text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-700 dark:text-neutral-300'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
