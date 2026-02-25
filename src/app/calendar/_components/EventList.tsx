'use client'

import type { CalendarEventRow } from '@/db/types'

interface Props {
  events:       CalendarEventRow[]
  onEventClick: (event: CalendarEventRow) => void
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    year:    'numeric',
  })
}

function groupByDate(events: CalendarEventRow[]): Map<string, CalendarEventRow[]> {
  const map = new Map<string, CalendarEventRow[]>()
  for (const ev of events) {
    if (ev.deleted_at) continue
    const key = ev.start_date
    const group = map.get(key) ?? []
    group.push(ev)
    map.set(key, group)
  }
  return map
}

export function EventList({ events, onEventClick }: Props) {
  if (events.filter((e) => !e.deleted_at).length === 0) {
    return (
      <p className="py-16 text-center text-sm text-neutral-400">
        No upcoming events.
      </p>
    )
  }

  const grouped = groupByDate(events)
  const sortedDates = [...grouped.keys()].sort()

  return (
    <div className="flex flex-col gap-6">
      {sortedDates.map((date) => (
        <div key={date}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {formatDate(date)}
          </div>
          <div className="flex flex-col gap-2">
            {grouped.get(date)!.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onEventClick(ev)}
                className="flex items-start gap-3 rounded-lg border border-neutral-100 px-4 py-3 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
              >
                <div
                  className="mt-1 h-3 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: ev.color ?? '#6b7280' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{ev.title}</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      {ev.all_day ? 'All day' : ev.start_date}
                    </span>
                    {ev.end_date && ev.end_date !== ev.start_date && (
                      <span className="text-xs text-neutral-400">→ {ev.end_date}</span>
                    )}
                  </div>
                  {ev.description && (
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{ev.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
