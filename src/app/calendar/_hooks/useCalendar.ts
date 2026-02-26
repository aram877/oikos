'use client'

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { CalendarEventRow, InsertCalendarEventInput, UpdateCalendarEventInput } from '@/db/types'
import { getSupabase } from '@/db/supabase'

export type CalendarView = 'month' | 'list'
export type RealtimeStatus = 'connecting' | 'connected' | 'error'

export interface ModalState {
  mode:       'add' | 'edit'
  prefillDate?: string
  event?:      CalendarEventRow
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function overlapsMonth(event: CalendarEventRow, yearMonth: string): boolean {
  const monthStart = `${yearMonth}-01`
  const [y, mo] = yearMonth.split('-').map(Number)
  const next = new Date(y, mo, 1) // 1st of next month
  const monthEnd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`

  return event.start_date < monthEnd &&
    ((event.end_date != null && event.end_date >= monthStart) || event.start_date >= monthStart)
}

export function useCalendar() {
  const [view,      setView]     = useState<CalendarView>('month')
  const [monthKey,  setMonthKey] = useState<string>(currentMonthKey)
  const [events,    setEvents]   = useState<CalendarEventRow[]>([])
  const [status,    setStatus]   = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error,     setError]    = useState<string | null>(null)
  const [rtStatus,  setRtStatus] = useState<RealtimeStatus>('connecting')
  const [modal,     setModal]    = useState<ModalState | null>(null)

  // ── Load events for current month ─────────────────────────────────────── //

  const loadEvents = useCallback(async (mk: string) => {
    setStatus('loading')
    setError(null)
    try {
      const rows = view === 'list'
        ? await dbClient.calendar.listUpcoming()
        : await dbClient.calendar.listByMonth(mk)
      setEvents(rows)
      setStatus('loaded')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [view])

  useEffect(() => {
    loadEvents(monthKey)
  }, [monthKey, loadEvents])

  // ── Realtime ──────────────────────────────────────────────────────────── //

  useEffect(() => {
    const supabase = getSupabase()

    const channel = supabase
      .channel('calendar_events_rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calendar_events' },
        (payload) => {
          const newEvent = payload.new as CalendarEventRow
          if (newEvent.deleted_at) return
          setEvents((prev) => {
            if (prev.some((e) => e.id === newEvent.id)) return prev
            if (overlapsMonth(newEvent, monthKey)) {
              return [...prev, newEvent].sort((a, b) => a.start_date.localeCompare(b.start_date))
            }
            return prev
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calendar_events' },
        (payload) => {
          const updated = payload.new as CalendarEventRow
          if (updated.deleted_at) {
            setEvents((prev) => prev.filter((e) => e.id !== updated.id))
          } else {
            setEvents((prev) =>
              prev
                .map((e) => e.id === updated.id ? updated : e)
                .filter((e) => overlapsMonth(e, monthKey))
                .sort((a, b) => a.start_date.localeCompare(b.start_date)),
            )
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'calendar_events' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setEvents((prev) => prev.filter((e) => e.id !== deletedId))
        },
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setRtStatus('connected')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setRtStatus('error')
      })

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey])

  // ── Mutations ─────────────────────────────────────────────────────────── //

  const addEvent = useCallback(async (input: InsertCalendarEventInput) => {
    const created = await dbClient.calendar.insert(input)
    setEvents((prev) => {
      if (overlapsMonth(created, monthKey)) {
        return [...prev, created].sort((a, b) => a.start_date.localeCompare(b.start_date))
      }
      return prev
    })
    return created
  }, [monthKey])

  const updateEvent = useCallback(async (id: string, input: UpdateCalendarEventInput) => {
    const updated = await dbClient.calendar.update(id, input)
    if (updated) {
      setEvents((prev) =>
        prev
          .map((e) => e.id === id ? updated : e)
          .filter((e) => overlapsMonth(e, monthKey))
          .sort((a, b) => a.start_date.localeCompare(b.start_date)),
      )
    }
    return updated
  }, [monthKey])

  const deleteEvent = useCallback(async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    await dbClient.calendar.softDelete(id)
  }, [])

  // ── Navigation ────────────────────────────────────────────────────────── //

  const goToPrevMonth = useCallback(() => setMonthKey((mk) => shiftMonth(mk, -1)), [])
  const goToNextMonth = useCallback(() => setMonthKey((mk) => shiftMonth(mk, +1)), [])

  // ── Modal helpers ─────────────────────────────────────────────────────── //

  const openAddModal    = useCallback((prefillDate?: string) => setModal({ mode: 'add', prefillDate }), [])
  const openEditModal   = useCallback((event: CalendarEventRow)   => setModal({ mode: 'edit', event }), [])
  const closeModal      = useCallback(() => setModal(null), [])

  const refresh = useCallback(() => loadEvents(monthKey), [loadEvents, monthKey])

  return {
    view, setView,
    monthKey,
    events,
    status, error,
    rtStatus,
    modal,
    openAddModal, openEditModal, closeModal,
    addEvent, updateEvent, deleteEvent,
    goToPrevMonth, goToNextMonth,
    refresh,
  }
}
