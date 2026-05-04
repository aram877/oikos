'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { formatEur } from '@/app/transactions/_utils/currency'

const STORAGE_KEY = 'oikos:privacy'
const MASK_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*?!'

function hashCents(cents: number): number {
  let h = 2166136261
  const s = String(cents)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function maskAmount(cents: number): string {
  const formatted = formatEur(cents)
  let seed = hashCents(cents) || 1
  let out = ''
  for (const ch of formatted) {
    if (ch >= '0' && ch <= '9') {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      out += MASK_CHARS[seed % MASK_CHARS.length]
    } else {
      out += ch
    }
  }
  return out
}

type PrivacyContextValue = {
  isPrivate: boolean
  setPrivate: (next: boolean) => void
  toggle: () => void
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

function readStored(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState<boolean>(false)

  // Hydrate from localStorage after mount.
  useEffect(() => {
    setIsPrivate(readStored())
  }, [])

  // Sync across tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setIsPrivate(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setPrivate = useCallback((next: boolean) => {
    setIsPrivate(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // storage unavailable — keep in-memory state only
    }
  }, [])

  const toggle = useCallback(() => setPrivate(!isPrivate), [isPrivate, setPrivate])

  const value = useMemo(
    () => ({ isPrivate, setPrivate, toggle }),
    [isPrivate, setPrivate, toggle],
  )

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext)
  if (!ctx) {
    // No provider — privacy stays off. This keeps standalone pages (e.g. login) safe.
    return { isPrivate: false, setPrivate: () => {}, toggle: () => {} }
  }
  return ctx
}

export function useFormatMoney(): (cents: number) => string {
  const { isPrivate } = usePrivacy()
  return useCallback(
    (cents: number) => (isPrivate ? maskAmount(cents) : formatEur(cents)),
    [isPrivate],
  )
}

export function Money({
  cents,
  signed = false,
  className,
}: {
  cents: number
  signed?: boolean
  className?: string
}) {
  const { isPrivate } = usePrivacy()
  const prefix = signed && cents > 0 ? '+' : ''
  const body = isPrivate ? maskAmount(cents) : formatEur(cents)
  return <span className={className}>{prefix}{body}</span>
}
