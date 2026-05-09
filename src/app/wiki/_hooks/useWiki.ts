'use client'

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { WikiPageRow } from '@/db/types'

export function useWikiList() {
  const [items,  setItems]  = useState<WikiPageRow[]>([])
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,  setError]  = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setStatus('loading')
      setError(null)
      setItems(await dbClient.wiki.list())
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await reload() })()
    return () => { cancelled = true }
  }, [reload])

  return { items, status, error, reload }
}

export function useWikiPage(id: string) {
  const [page,   setPage]   = useState<WikiPageRow | null>(null)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'not-found' | 'error'>('loading')
  const [error,  setError]  = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setStatus('loading')
      setError(null)
      const row = await dbClient.wiki.get(id)
      if (row === null) { setStatus('not-found'); return }
      setPage(row)
      setStatus('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    void (async () => { if (!cancelled) await reload() })()
    return () => { cancelled = true }
  }, [reload])

  const save = useCallback(async (input: { title?: string; body?: string }) => {
    const updated = await dbClient.wiki.update(id, input)
    if (updated) setPage(updated)
  }, [id])

  return { page, status, error, reload, save }
}
