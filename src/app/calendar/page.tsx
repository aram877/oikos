'use client'

import { useCalendar }       from './_hooks/useCalendar'
import { MonthGrid }         from './_components/MonthGrid'
import { EventList }         from './_components/EventList'
import { EventModal }        from './_components/EventModal'
import { IcsImportButton }   from './_components/IcsImportButton'
import { useMemberNames }    from '@/hooks/useMemberNames'

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function CalendarPage() {
  const memberNames = useMemberNames()
  const {
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
  } = useCalendar()

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Calendar</h1>

        {/* Realtime indicator */}
        <span
          className="flex items-center gap-1.5 text-xs text-neutral-400"
          title={rtStatus === 'connected' ? 'Live sync active' : rtStatus === 'error' ? 'Sync error' : 'Connecting…'}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              rtStatus === 'connected' ? 'bg-green-500' : rtStatus === 'error' ? 'bg-red-400' : 'bg-yellow-400'
            }`}
          />
          {rtStatus === 'connected' ? 'Live' : rtStatus === 'error' ? 'Sync error' : 'Connecting'}
        </span>

        {/* ICS import */}
        <IcsImportButton onDone={refresh} />

        {/* View toggle */}
        <div className="flex rounded border border-neutral-200 text-sm dark:border-neutral-700">
          <button
            onClick={() => setView('month')}
            className={`px-3 py-1.5 ${view === 'month' ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800'} rounded-l`}
          >
            Month
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 ${view === 'list' ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800'} rounded-r border-l border-neutral-200 dark:border-neutral-700`}
          >
            List
          </button>
        </div>

        {/* Add button */}
        <button
          onClick={() => openAddModal()}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          + Add
        </button>
      </div>

      {/* Month navigation (only in month view) */}
      {view === 'month' && (
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={goToPrevMonth}
            className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Previous month"
          >
            ← Prev
          </button>
          <h2 className="text-base font-medium">{formatMonthLabel(monthKey)}</h2>
          <button
            onClick={goToNextMonth}
            className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Next month"
          >
            Next →
          </button>
        </div>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
      )}

      {/* Error */}
      {status === 'error' && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error ?? 'Failed to load events.'}
        </p>
      )}

      {/* Content */}
      {status === 'loaded' && view === 'month' && (
        <MonthGrid
          monthKey={monthKey}
          events={events}
          onDayClick={openAddModal}
          onEventClick={openEditModal}
        />
      )}

      {status === 'loaded' && view === 'list' && (
        <EventList events={events} onEventClick={openEditModal} />
      )}

      {/* Modal */}
      {modal && (
        <EventModal
          modal={modal}
          onClose={closeModal}
          onAdd={addEvent}
          onUpdate={updateEvent}
          onDelete={deleteEvent}
          memberNames={memberNames}
        />
      )}

    </div>
  )
}
