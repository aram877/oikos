'use client'

import { useRef, useState } from 'react'
import { dbClient }      from '@/db/db.client'
import { parseIcsText }  from '@/lib/ics'
import type { BulkInsertCalendarEventInput } from '@/db/types'

type State =
  | { phase: 'idle' }
  | { phase: 'preview'; events: BulkInsertCalendarEventInput[]; skipped: number }
  | { phase: 'importing' }
  | { phase: 'done'; count: number }
  | { phase: 'error'; message: string }

interface Props {
  /** Called after a successful import with the number of newly inserted events. */
  onDone: (count: number) => void
}

export function IcsImportButton({ onDone }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ phase: 'idle' })

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow re-selecting same file

    try {
      const text              = await file.text()
      const { events, skipped } = parseIcsText(text)

      if (events.length === 0 && skipped === 0) {
        setState({ phase: 'error', message: 'No events found in this file.' })
        return
      }

      setState({ phase: 'preview', events, skipped })
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function handleImport() {
    if (state.phase !== 'preview') return
    setState({ phase: 'importing' })
    try {
      const count = await dbClient.calendar.bulkInsert(state.events)
      setState({ phase: 'done', count })
      onDone(count)
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function reset() { setState({ phase: 'idle' }) }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ics,text/calendar"
        onChange={onFileChange}
        className="hidden"
      />

      {state.phase === 'idle' && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Import .ics
        </button>
      )}

      {state.phase === 'preview' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {state.events.length} event{state.events.length !== 1 ? 's' : ''}
            {state.skipped > 0 && `, ${state.skipped} skipped`}
          </span>
          <button
            onClick={handleImport}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Import
          </button>
          <button
            onClick={reset}
            className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Cancel
          </button>
        </div>
      )}

      {state.phase === 'importing' && (
        <span className="text-sm text-neutral-400">Importing…</span>
      )}

      {state.phase === 'done' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-green-600 dark:text-green-400">
            {state.count} event{state.count !== 1 ? 's' : ''} imported
          </span>
          <button
            onClick={reset}
            className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="flex items-center gap-2">
          <span className="max-w-[260px] truncate text-sm text-red-600 dark:text-red-400">
            {state.message}
          </span>
          <button
            onClick={reset}
            className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
