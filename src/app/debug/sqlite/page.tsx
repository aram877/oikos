'use client'

/**
 * ⚠️  SPIKE — DELETE BEFORE PRODUCTION
 *
 * Route:   /debug/sqlite
 * Purpose: Prove SQLite WASM + OPFS persistence works in Next.js.
 *
 * HOW TO TEST PERSISTENCE:
 *   1. Open http://localhost:3000/debug/sqlite
 *   2. Click "Insert test row" a few times
 *   3. Hard-reload the page (Ctrl+Shift+R / Cmd+Shift+R)
 *   4. Rows should still be listed in the table
 *   If rows survive → OPFS is persisting correctly → spike passed.
 *
 * EXPECTED FIRST-OPEN LOG:
 *   Spawning worker…
 *   DB init → ok
 *   Loaded 0 existing row(s) from OPFS
 *
 * EXPECTED AFTER RELOAD (with prior rows):
 *   Spawning worker…
 *   DB init → ok          ← "ok" means opened, not "already-open"
 *   Loaded N existing row(s) from OPFS   ← N > 0 = persistence works
 */

import { useEffect, useRef, useState, useCallback } from 'react'

type Row     = { id: number; label: string; ts: string }
type Status  = 'idle' | 'loading' | 'ready' | 'error'
type OutMsg  = { id: string; result?: unknown; error?: string }

// ── Component ───────────────────────────────────────────────────────────── //

export default function SqliteSpikePage() {
  const workerRef             = useRef<Worker | null>(null)
  const [status, setStatus]   = useState<Status>('idle')
  const [error,  setError]    = useState<string | null>(null)
  const [rows,   setRows]     = useState<Row[]>([])
  const [log,    setLog]      = useState<string[]>([])

  // Prepend to log, capped at 50 lines.
  const addLog = useCallback((msg: string) => {
    setLog((prev) => [`${ts()} ${msg}`, ...prev].slice(0, 50))
  }, [])

  // Sends a message to the worker and resolves/rejects on response.
  const callWorker = useCallback(<T,>(
    method: string,
    args:   string[] = [],
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const worker = workerRef.current
      if (!worker) return reject(new Error('Worker not initialised'))

      const id = crypto.randomUUID()

      const handler = (e: MessageEvent<OutMsg>) => {
        if (e.data.id !== id) return
        worker.removeEventListener('message', handler)
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.result as T)
      }

      worker.addEventListener('message', handler)
      worker.postMessage({ id, method, args })
    })
  }, [])

  // Spawn worker + init DB on mount.
  useEffect(() => {
    setStatus('loading')
    addLog('Spawning worker…')

    const worker = new Worker(new URL('./db.worker.ts', import.meta.url))
    workerRef.current = worker

    // Surface webpack/runtime errors (e.g. WASM load failure).
    worker.onerror = (e) => {
      const msg = `Worker load error: ${e.message ?? 'unknown'}`
      addLog(msg)
      setError(msg + '\n\nIf this is a WASM error, run: node scripts/copy-wasm.mjs')
      setStatus('error')
    }

    void (async () => {
      try {
        const initResult = await callWorker<string>('init')
        addLog(`DB init → ${initResult}`)
        setStatus('ready')

        const existing = await callWorker<Row[]>('list')
        setRows(existing)
        addLog(`Loaded ${existing.length} existing row(s) from OPFS`)
      } catch (err) {
        const msg = String(err)
        addLog(`Init ERROR: ${msg}`)
        setError(msg)
        setStatus('error')
      }
    })()

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [addLog, callWorker])

  // ── Handlers ─────────────────────────────────────────────────────────── //

  const handleInsert = async () => {
    try {
      const label = `row-${Date.now()}`
      addLog(`Inserting "${label}"…`)
      const { id } = await callWorker<{ id: number }>('insert', [label])
      addLog(`Inserted → id=${id}`)
      const updated = await callWorker<Row[]>('list')
      setRows(updated)
    } catch (err) {
      addLog(`Insert ERROR: ${String(err)}`)
    }
  }

  const handleList = async () => {
    try {
      const updated = await callWorker<Row[]>('list')
      setRows(updated)
      addLog(`Listed ${updated.length} row(s)`)
    } catch (err) {
      addLog(`List ERROR: ${String(err)}`)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────── //

  const statusColour: Record<Status, string> = {
    idle:    'text-gray-500',
    loading: 'text-yellow-400',
    ready:   'text-green-400',
    error:   'text-red-400',
  }

  const btnBase    = 'px-4 py-2 rounded text-sm transition-colors'
  const btnPrimary = `${btnBase} bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600`
  const btnSecond  = `${btnBase} bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600`

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8 font-mono text-sm">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <p className="text-yellow-400 text-xs mb-1">⚠️ SPIKE — DELETE BEFORE PRODUCTION</p>
          <h1 className="text-xl font-bold">SQLite WASM + OPFS — Persistence Spike</h1>
          <p className="text-gray-400 text-xs mt-1">
            Insert rows → hard-reload (Ctrl+Shift+R) → rows must still be listed.
          </p>
        </div>

        {/* Status */}
        <div className={`font-semibold ${statusColour[status]}`}>
          ● {status.toUpperCase()}
        </div>

        {/* Error box */}
        {error && (
          <pre className="bg-red-950 border border-red-700 rounded p-3 text-red-300 text-xs whitespace-pre-wrap break-all">
            {error}
          </pre>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={handleInsert} disabled={status !== 'ready'} className={btnPrimary}>
            Insert test row
          </button>
          <button onClick={handleList} disabled={status !== 'ready'} className={btnSecond}>
            List rows
          </button>
        </div>

        {/* Rows table */}
        <div>
          <p className="text-gray-500 text-xs mb-2">
            ROWS ({rows.length})
            {rows.length > 0 && ' — if these survive a reload, OPFS works ✓'}
          </p>

          {rows.length === 0 ? (
            <p className="text-gray-600">No rows yet. Insert some, then reload.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-gray-500 text-xs border-b border-gray-800">
                  <th className="pb-1 pr-6 font-normal">ID</th>
                  <th className="pb-1 pr-6 font-normal">Label</th>
                  <th className="pb-1 font-normal">Inserted at</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-900">
                    <td className="py-1 pr-6 text-gray-400">{row.id}</td>
                    <td className="py-1 pr-6">{row.label}</td>
                    <td className="py-1 text-gray-400">
                      {row.ts.slice(0, 19).replace('T', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Log */}
        <div>
          <p className="text-gray-500 text-xs mb-2">LOG (newest first)</p>
          <div className="bg-gray-900 rounded p-3 text-xs space-y-0.5 max-h-52 overflow-y-auto">
            {log.length === 0
              ? <p className="text-gray-600">No entries yet.</p>
              : log.map((entry, i) => <p key={i} className="text-gray-300">{entry}</p>)
            }
          </div>
        </div>

        {/* Checklist */}
        <div className="text-xs text-gray-500 space-y-1 border-t border-gray-800 pt-4">
          <p className="text-gray-400 font-semibold mb-2">Spike pass criteria</p>
          <p>□ Status reaches READY (WASM loads, SAHPool VFS installs)</p>
          <p>□ Insert works (row appears in table)</p>
          <p>□ Hard-reload → rows still present (OPFS persistence confirmed)</p>
          <p>□ Works in Chrome 102+, Firefox 111+, Safari 15.2+</p>
        </div>

      </div>
    </main>
  )
}

function ts(): string {
  return new Date().toISOString().slice(11, 23)
}
