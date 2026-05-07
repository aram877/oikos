/**
 * Time formatters tuned for chat messages.
 *
 * `relativeTime()` ("2d ago") works for notifications but feels wrong inside
 * a conversation — premium chat apps use clock time, with the date promoted
 * only when it's older than today.
 */

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour:   '2-digit',
  minute: '2-digit',
})

const SHORT_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day:   'numeric',
})

const FULL_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month:   'long',
  day:     'numeric',
})

const FULL_DATETIME_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month:   'short',
  day:     'numeric',
  hour:    '2-digit',
  minute:  '2-digit',
})

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)
}

/**
 * Tight in-bubble timestamp: "10:42" today, "Yesterday 10:42" yesterday,
 * "Mon 10:42" within a week, otherwise "Mar 14".
 */
export function bubbleTime(iso: string): string {
  const d    = new Date(iso)
  const diff = daysBetween(new Date(), d)
  if (diff === 0) return TIME_FMT.format(d)
  if (diff === 1) return `Yesterday ${TIME_FMT.format(d)}`
  if (diff < 7)   return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${TIME_FMT.format(d)}`
  return SHORT_DATE_FMT.format(d)
}

/**
 * Day separator label inside the message stream.
 */
export function dayLabel(iso: string): string {
  const d    = new Date(iso)
  const diff = daysBetween(new Date(), d)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)   return d.toLocaleDateString(undefined, { weekday: 'long' })
  return FULL_DATE_FMT.format(d)
}

/**
 * Conversation-list timestamp (right-aligned, terse).
 * Today → "10:42"; yesterday → "Yesterday"; this week → "Mon"; older → "Mar 14".
 */
export function listTime(iso: string): string {
  const d    = new Date(iso)
  const diff = daysBetween(new Date(), d)
  if (diff === 0) return TIME_FMT.format(d)
  if (diff === 1) return 'Yesterday'
  if (diff < 7)   return d.toLocaleDateString(undefined, { weekday: 'short' })
  return SHORT_DATE_FMT.format(d)
}

/**
 * Full timestamp for hover tooltips on bubbles.
 */
export function fullTimestamp(iso: string): string {
  return FULL_DATETIME_FMT.format(new Date(iso))
}

/**
 * "Active now" if last_read_at is within the threshold (default 2 minutes).
 */
export function isActiveNow(iso: string | null, thresholdMs = 2 * 60_000): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < thresholdMs
}

/**
 * "Last seen 5m ago" for presence subtitle.
 */
export function lastSeenLabel(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)        return 'Active now'
  if (ms < 60 * 60_000)   return `Active ${Math.floor(ms / 60_000)}m ago`
  if (ms < 24 * 3_600_000) return `Active ${Math.floor(ms / 3_600_000)}h ago`
  return `Last seen ${listTime(iso)}`
}
