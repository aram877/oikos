'use client'

import type { CalendarEventRow } from '@/db/types'

interface Props {
  monthKey:      string
  events:        CalendarEventRow[]
  onDayClick:    (dateStr: string) => void
  onEventClick:  (event: CalendarEventRow) => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function daysInMonth(yearMonth: string): Date[] {
  const [year, month] = yearMonth.split('-').map(Number)
  const days: Date[] = []
  const date = new Date(year, month - 1, 1)
  while (date.getMonth() === month - 1) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function eventsForDay(events: CalendarEventRow[], day: string): CalendarEventRow[] {
  return events.filter((e) => {
    if (e.deleted_at) return false
    const end = e.end_date ?? e.start_date
    return e.start_date <= day && end >= day
  })
}

export function MonthGrid({ monthKey, events, onDayClick, onEventClick }: Props) {
  const days = daysInMonth(monthKey)
  const today = isoDate(new Date())

  // Monday-based: Mon=0 … Sun=6; JS getDay(): Sun=0 Mon=1 … Sat=6
  const firstDay  = days[0]
  const jsDay     = firstDay.getDay()
  const startOffset = jsDay === 0 ? 6 : jsDay - 1 // blank cells before the 1st

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-neutral-400">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-neutral-100 dark:bg-neutral-800">
        {/* Blank cells for offset */}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`blank-${i}`} className="min-h-20 bg-white dark:bg-neutral-950" />
        ))}

        {days.map((day) => {
          const dayStr  = isoDate(day)
          const isToday = dayStr === today
          const dayEvents = eventsForDay(events, dayStr)

          return (
            <div
              key={dayStr}
              onClick={() => onDayClick(dayStr)}
              className="min-h-20 cursor-pointer bg-white p-1 hover:bg-neutral-50 dark:bg-neutral-950 dark:hover:bg-neutral-900"
            >
              {/* Day number */}
              <div className="mb-0.5 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                      : 'text-neutral-500'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>

              {/* Event pills */}
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                    className="w-full truncate rounded px-1 py-0.5 text-left text-xs font-medium text-white"
                    style={{ backgroundColor: ev.color ?? '#6b7280' }}
                    title={ev.title}
                  >
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="px-1 text-xs text-neutral-400">+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
