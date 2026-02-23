import { useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { CategoryRow } from '@/db/types'

export interface UseCategoriesResult {
  loading:    boolean
  loadError:  string | null
  categories: CategoryRow[]
  add:        (name: string, parentId: string | null) => Promise<void>
  rename:     (id: string, name: string) => Promise<void>
  reparent:   (id: string, parentId: string | null) => Promise<void>
  remove:     (id: string) => Promise<void>
}

export function useCategories(): UseCategoriesResult {
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState<string | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])

  async function reload(): Promise<void> {
    const cats = await dbClient.categories.list()
    setCategories(cats)
  }

  useEffect(() => {
    let cancelled = false
    dbClient.init()
      .then(() => dbClient.categories.list())
      .then(cats => {
        if (cancelled) return
        setCategories(cats)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function add(name: string, parentId: string | null): Promise<void> {
    await dbClient.categories.insert({ name, parent_id: parentId })
    await reload()
  }

  async function rename(id: string, name: string): Promise<void> {
    await dbClient.categories.update(id, { name })
    await reload()
  }

  async function reparent(id: string, parentId: string | null): Promise<void> {
    await dbClient.categories.update(id, { parent_id: parentId })
    await reload()
  }

  async function remove(id: string): Promise<void> {
    await dbClient.categories.softDelete(id)
    await reload()
  }

  return { loading, loadError, categories, add, rename, reparent, remove }
}
