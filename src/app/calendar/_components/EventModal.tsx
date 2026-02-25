'use client'

import { useEffect, useRef, useState } from 'react'
import type { CalendarEventRow, InsertCalendarEventInput, UpdateCalendarEventInput } from '@/db/types'
import type { ModalState } from '../_hooks/useCalendar'

const PRESET_COLORS = [
  { label: 'Blue',   value: '#3b82f6' },
  { label: 'Green',  value: '#22c55e' },
  { label: 'Red',    value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Gray',   value: '#6b7280' },
]

interface Props {
  modal:       ModalState
  onClose:     () => void
  onAdd:       (input: InsertCalendarEventInput)                     => Promise<CalendarEventRow>
  onUpdate:    (id: string, input: UpdateCalendarEventInput)         => Promise<CalendarEventRow | null>
  onDelete:    (id: string)                                          => Promise<void>
}

export function EventModal({ modal, onClose, onAdd, onUpdate, onDelete }: Props) {
  const isEdit = modal.mode === 'edit'
  const ev     = modal.event

  const [title,       setTitle]       = useState(ev?.title       ?? '')
  const [description, setDescription] = useState(ev?.description ?? '')
  const [startDate,   setStartDate]   = useState(ev?.start_date  ?? modal.prefillDate ?? '')
  const [endDate,     setEndDate]     = useState(ev?.end_date     ?? '')
  const [allDay,      setAllDay]      = useState(ev?.all_day      ?? true)
  const [color,       setColor]       = useState(ev?.color        ?? '#3b82f6')
  const [busy,        setBusy]        = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [err,         setErr]         = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startDate) return
    setBusy(true)
    setErr(null)
    try {
      const input = {
        title:       title.trim(),
        description: description.trim() || null,
        start_date:  startDate,
        end_date:    endDate || null,
        all_day:     allDay,
        color,
      }
      if (isEdit && ev) {
        await onUpdate(ev.id, input)
      } else {
        await onAdd(input)
      }
      onClose()
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!ev) return
    if (!confirmDel) { setConfirmDel(true); return }
    setBusy(true)
    try {
      await onDelete(ev.id)
      onClose()
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isEdit ? 'Edit event' : 'New event'}</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Title *</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={busy}
              className="w-full rounded border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Start date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                disabled={busy}
                className="w-full rounded border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                disabled={busy}
                className="w-full rounded border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
          </div>

          {/* All-day toggle */}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              disabled={busy}
              className="accent-neutral-800 dark:accent-neutral-200"
            />
            All day
          </label>

          {/* Color picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Color</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  disabled={busy}
                  title={c.label}
                  className={`h-7 w-7 rounded-full transition-transform ${color === c.value ? 'scale-125 ring-2 ring-offset-1 ring-neutral-400' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c.value }}
                  aria-label={c.label}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={busy}
              className="w-full rounded border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>

          {err && (
            <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {err}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className={`text-sm ${confirmDel ? 'font-semibold text-red-600 dark:text-red-400' : 'text-neutral-400 hover:text-red-600 dark:hover:text-red-400'}`}
              >
                {confirmDel ? 'Confirm delete' : 'Delete'}
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || !startDate || busy}
                className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                {isEdit ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
