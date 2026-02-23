'use client'

import { useState } from 'react'
import { validateBackup } from '@/db/backup/validateBackup'
import { getSupabase } from '@/db/supabase'
import { getActiveAccountId } from '@/db/accountContext'
import { dbClient } from '@/db/db.client'
import type { BackupFile, CategoryRow } from '@/db/types'

export interface MigrationProgress {
  imported: number
  skipped:  number
  total:    number
}

export interface UseMigrationResult {
  progress:  MigrationProgress | null
  error:     string | null
  done:      boolean
  migrate:   (file: File) => Promise<void>
  isRunning: boolean
}

export function useMigration(): UseMigrationResult {
  const [progress,  setProgress]  = useState<MigrationProgress | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [done,      setDone]      = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  async function migrate(file: File) {
    setError(null)
    setProgress(null)
    setDone(false)
    setIsRunning(true)

    try {
      // ── 1. Parse and validate the backup JSON ──────────────────────────── //
      const text   = await file.text()
      const parsed = JSON.parse(text) as unknown
      const validation = validateBackup(parsed)
      if (!validation.valid) {
        throw new Error(`Invalid backup:\n${validation.errors.join('\n')}`)
      }

      const backup    = parsed as BackupFile
      const accountId = await getActiveAccountId()
      const supabase  = getSupabase()

      // ── 2. Fetch existing cloud categories to build name→id map ─────────── //
      await dbClient.init()
      const existingCats = await dbClient.categories.list()
      const nameToId = new Map<string, string>(existingCats.map((c) => [c.name.toLowerCase(), c.id]))

      // ── 3. Create any missing categories from backup ─────────────────────── //
      const oldToNew = new Map<string, string>()

      // First pass: top-level categories
      for (const cat of backup.contents.categories) {
        if (cat.deleted_at !== null || cat.parent_id !== null) continue
        const key = cat.name.toLowerCase()
        if (nameToId.has(key)) {
          oldToNew.set(cat.id, nameToId.get(key)!)
        } else {
          const created = await dbClient.categories.insert({ name: cat.name, parent_id: null })
          nameToId.set(key, created.id)
          oldToNew.set(cat.id, created.id)
        }
      }

      // Second pass: child categories (parent must exist after first pass)
      for (const cat of backup.contents.categories) {
        if (cat.deleted_at !== null || cat.parent_id === null) continue
        const key       = cat.name.toLowerCase()
        const parentId  = cat.parent_id ? (oldToNew.get(cat.parent_id) ?? null) : null
        const matchKey  = `${key}:${parentId}`

        // Match by name + parent
        const existingChild = existingCats.find(
          (c: CategoryRow) =>
            c.name.toLowerCase() === key && c.parent_id === parentId,
        )
        if (existingChild) {
          oldToNew.set(cat.id, existingChild.id)
        } else if (nameToId.has(matchKey)) {
          oldToNew.set(cat.id, nameToId.get(matchKey)!)
        } else {
          const created = await dbClient.categories.insert({ name: cat.name, parent_id: parentId })
          nameToId.set(matchKey, created.id)
          oldToNew.set(cat.id, created.id)
        }
      }

      // ── 4. Remap + bulk-insert transactions ────────────────────────────── //
      const txs = backup.contents.transactions.filter((t) => t.deleted_at === null)
      const total = txs.length
      setProgress({ imported: 0, skipped: 0, total })

      const CHUNK = 200
      let imported = 0
      let skipped  = 0

      for (let i = 0; i < txs.length; i += CHUNK) {
        const chunk = txs.slice(i, i + CHUNK)
        const rows = chunk.map((t) => ({
          account_id:   accountId,
          category_id:  t.category_id ? (oldToNew.get(t.category_id) ?? null) : null,
          amount_cents: t.amount_cents,
          currency:     t.currency,
          date:         t.date,
          description:  t.description,
          notes:        t.notes,
          import_hash:  t.import_hash,
        }))

        const { data, error: upsertErr } = await supabase
          .from('transactions')
          .upsert(rows, { onConflict: 'account_id,import_hash', ignoreDuplicates: true })
          .select('id')

        if (upsertErr) throw new Error(`Bulk insert failed: ${upsertErr.message}`)

        const insertedCount = data?.length ?? 0
        imported += insertedCount
        skipped  += chunk.length - insertedCount

        setProgress({ imported, skipped, total })
      }

      // ── 5. Mark migration done in user metadata ────────────────────────── //
      const { createClient } = await import('@/lib/supabase/client')
      const browserClient = createClient()
      await browserClient.auth.updateUser({
        data: { local_migration_done: true },
      })

      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRunning(false)
    }
  }

  return { progress, error, done, migrate, isRunning }
}
