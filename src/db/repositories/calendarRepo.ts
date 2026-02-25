import type {
  CalendarEventRow,
  InsertCalendarEventInput,
  UpdateCalendarEventInput,
} from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

// ── Month helpers ─────────────────────────────────────────────────────────── //

function monthRange(yearMonth: string): { start: string; end: string } {
  const start = `${yearMonth}-01`
  const [year, month] = yearMonth.split('-').map(Number)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const end = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

const SELECT_COLS = 'id, account_id, title, description, start_date, end_date, all_day, color, created_by, updated_by, created_at, updated_at, deleted_at'

// ── Read operations ───────────────────────────────────────────────────────── //

/**
 * Lists active events that overlap the given calendar month.
 * An event overlaps if: start_date < month_end AND (end_date >= month_start OR start_date >= month_start)
 */
export async function listByMonth(
  yearMonth: string,
  accountId?: string,
): Promise<CalendarEventRow[]> {
  const { start, end } = monthRange(yearMonth)
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('calendar_events')
    .select(SELECT_COLS)
    .eq('account_id', resolvedAccountId)
    .is('deleted_at', null)
    .lt('start_date', end)
    .or(`end_date.gte.${start},start_date.gte.${start}`)
    .order('start_date', { ascending: true })

  if (error) throw new Error(`[calendarRepo.listByMonth] ${error.message}`)
  return (data ?? []) as CalendarEventRow[]
}

/**
 * Lists upcoming active events (today onwards), up to 50, ordered by start_date.
 */
export async function listUpcoming(accountId?: string): Promise<CalendarEventRow[]> {
  const today = new Date().toISOString().slice(0, 10)
  const resolvedAccountId = accountId ?? await getActiveAccountId()
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('calendar_events')
    .select(SELECT_COLS)
    .eq('account_id', resolvedAccountId)
    .is('deleted_at', null)
    .gte('start_date', today)
    .order('start_date', { ascending: true })
    .limit(50)

  if (error) throw new Error(`[calendarRepo.listUpcoming] ${error.message}`)
  return (data ?? []) as CalendarEventRow[]
}

// ── Write operations ──────────────────────────────────────────────────────── //

/**
 * Inserts a new calendar event and returns the created row.
 */
export async function insertEvent(
  input: InsertCalendarEventInput,
): Promise<CalendarEventRow> {
  const accountId = await getActiveAccountId()
  const supabase  = getSupabase()

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      account_id:  accountId,
      title:       input.title,
      description: input.description ?? null,
      start_date:  input.start_date,
      end_date:    input.end_date    ?? null,
      all_day:     input.all_day     ?? true,
      color:       input.color       ?? null,
      created_by:  userId,
    })
    .select(SELECT_COLS)
    .single()

  if (error) throw new Error(`[calendarRepo.insertEvent] ${error.message}`)
  if (!data) throw new Error('[calendarRepo.insertEvent] No row returned')
  return data as CalendarEventRow
}

/**
 * Updates mutable fields on a calendar event.
 */
export async function updateEvent(
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEventRow | null> {
  const supabase = getSupabase()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id ?? null

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }

  if (input.title       !== undefined) updates['title']       = input.title
  if (input.description !== undefined) updates['description'] = input.description ?? null
  if (input.start_date  !== undefined) updates['start_date']  = input.start_date
  if (input.end_date    !== undefined) updates['end_date']    = input.end_date    ?? null
  if (input.all_day     !== undefined) updates['all_day']     = input.all_day
  if (input.color       !== undefined) updates['color']       = input.color       ?? null

  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select(SELECT_COLS)
    .single()

  if (error?.code === 'PGRST116') return null
  if (error) throw new Error(`[calendarRepo.updateEvent] ${error.message}`)
  return data as CalendarEventRow | null
}

/**
 * Soft-deletes a calendar event by setting deleted_at = now().
 */
export async function softDeleteEvent(id: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('calendar_events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`[calendarRepo.softDeleteEvent] ${error.message}`)
  return (data?.length ?? 0) > 0
}
