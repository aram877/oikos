'use client'

import { useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { AccountBalance } from '@/db/types'

export function useAccountBalance() {
  const [balance, setBalance] = useState<AccountBalance | null>(null)
  const [status, setStatus]   = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    dbClient.transactions.getBalance()
      .then(b => { setBalance(b); setStatus('loaded') })
      .catch(err => { setError(err instanceof Error ? err.message : String(err)); setStatus('error') })
  }, [])

  return { balance, status, error }
}
