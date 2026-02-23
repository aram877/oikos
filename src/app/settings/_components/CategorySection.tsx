'use client'

import { useState } from 'react'
import type { CategoryRow } from '@/db/types'
import type { UseCategoriesResult } from '../_hooks/useCategories'
import { buildDisplayList } from '../_utils/categoryUtils'

// ── Component ─────────────────────────────────────────────────────────────── //

type Props = UseCategoriesResult

export function CategorySection({ loading, loadError, categories, add, rename, reparent, remove }: Props) {

  // ── UI state only — no DB calls here ─────────────────────────────────── //

  const [addOpen,   setAddOpen]   = useState(false)
  const [addName,   setAddName]   = useState('')
  const [addParent, setAddParent] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError,  setAddError]  = useState<string | null>(null)

  const [renamingId,   setRenamingId]   = useState<string | null>(null)
  const [renameVal,    setRenameVal]    = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  const [deletingId,       setDeletingId]       = useState<string | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState(false)

  const [movingId,   setMovingId]   = useState<string | null>(null)
  const [moveParent, setMoveParent] = useState('')
  const [moveSaving, setMoveSaving] = useState(false)

  // ── Action handlers ───────────────────────────────────────────────────── //

  async function handleAdd() {
    const name = addName.trim()
    if (!name) { setAddError('Name is required.'); return }
    setAddSaving(true)
    setAddError(null)
    try {
      await add(name, addParent || null)
      setAddName('')
      setAddParent('')
      setAddOpen(false)
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : String(err))
    } finally {
      setAddSaving(false)
    }
  }

  async function handleRename() {
    const name = renameVal.trim()
    if (!name || !renamingId) return
    setRenameSaving(true)
    try {
      await rename(renamingId, name)
      setRenamingId(null)
    } finally {
      setRenameSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleteInProgress(true)
    try {
      await remove(id)
      setDeletingId(null)
    } finally {
      setDeleteInProgress(false)
    }
  }

  function startRename(cat: CategoryRow) {
    setDeletingId(null)
    setRenamingId(cat.id)
    setRenameVal(cat.name)
  }

  function startDelete(id: string) {
    setRenamingId(null)
    setMovingId(null)
    setDeletingId(id)
  }

  function startMove(cat: CategoryRow) {
    setRenamingId(null)
    setDeletingId(null)
    setMovingId(cat.id)
    setMoveParent(cat.parent_id ?? '')
  }

  async function handleMove() {
    if (!movingId) return
    setMoveSaving(true)
    try {
      await reparent(movingId, moveParent || null)
      setMovingId(null)
    } finally {
      setMoveSaving(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────── //

  const displayList   = buildDisplayList(categories)
  const parentOptions = categories.filter(c => c.parent_id === null)

  // ── Early returns ─────────────────────────────────────────────────────── //

  if (loading) {
    return <p className="text-sm text-neutral-400">Loading…</p>
  }

  if (loadError) {
    return (
      <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {loadError}
      </p>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────── //

  return (
    <>
      {/* Category list */}
      {displayList.length === 0 ? (
        <p className="mb-3 text-sm text-neutral-400">No categories yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700">
          {displayList.map(({ cat, indent, hasChildren }) => (
            <li key={cat.id} className="px-4 py-2.5">

              {/* Rename mode */}
              {renamingId === cat.id && (
                <div className="flex items-center gap-2">
                  {indent && <span className="select-none text-neutral-300 dark:text-neutral-600">↳</span>}
                  <input
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    autoFocus
                    disabled={renameSaving}
                    className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
                  />
                  <button
                    type="button"
                    onClick={handleRename}
                    disabled={renameSaving}
                    className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    {renameSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    disabled={renameSaving}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Delete confirmation mode */}
              {deletingId === cat.id && (
                <div className="flex flex-wrap items-center gap-2">
                  {indent && <span className="select-none text-neutral-300 dark:text-neutral-600">↳</span>}
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    Delete <strong>{cat.name}</strong>?
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(cat.id)}
                    disabled={deleteInProgress}
                    className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteInProgress ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(null)}
                    disabled={deleteInProgress}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Move mode */}
              {movingId === cat.id && (
                <div className="flex flex-wrap items-center gap-2">
                  {indent && <span className="select-none text-neutral-300 dark:text-neutral-600">↳</span>}
                  <span className="text-sm text-neutral-700 dark:text-neutral-300 shrink-0">{cat.name}</span>
                  <select
                    value={moveParent}
                    onChange={e => setMoveParent(e.target.value)}
                    disabled={moveSaving}
                    className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
                  >
                    <option value="">Top-level (no parent)</option>
                    {parentOptions
                      .filter(p => p.id !== cat.id)
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleMove}
                    disabled={moveSaving}
                    className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    {moveSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovingId(null)}
                    disabled={moveSaving}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Normal row */}
              {renamingId !== cat.id && deletingId !== cat.id && movingId !== cat.id && (
                <div className="flex items-center gap-2">
                  {indent && <span className="select-none text-neutral-300 dark:text-neutral-600">↳</span>}
                  <span className="flex-1 text-sm">{cat.name}</span>
                  <button
                    type="button"
                    onClick={() => startRename(cat)}
                    className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => startMove(cat)}
                    className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    onClick={() => startDelete(cat.id)}
                    disabled={hasChildren}
                    title={hasChildren ? 'Delete subcategories first' : undefined}
                    className="text-xs text-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              )}

            </li>
          ))}
        </ul>
      )}

      {/* Add category form */}
      {addOpen ? (
        <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <p className="mb-3 text-sm font-medium">New category</p>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="e.g. Subscriptions"
              autoFocus
              disabled={addSaving}
              className="rounded border border-neutral-200 px-3 py-2 text-sm placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
            />
            {parentOptions.length > 0 && (
              <select
                value={addParent}
                onChange={e => setAddParent(e.target.value)}
                disabled={addSaving}
                className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="">No parent (top-level)</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            {addError && (
              <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAdd}
                disabled={addSaving}
                className="rounded bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
              >
                {addSaving ? 'Saving…' : 'Add category'}
              </button>
              <button
                type="button"
                onClick={() => { setAddOpen(false); setAddName(''); setAddParent(''); setAddError(null) }}
                disabled={addSaving}
                className="text-sm text-neutral-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          + Add category
        </button>
      )}
    </>
  )
}
