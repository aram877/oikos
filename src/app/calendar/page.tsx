'use client'

import { useEffect } from 'react'
import { useCalendar }       from './_hooks/useCalendar'
import { MonthGrid }         from './_components/MonthGrid'
import { EventList }         from './_components/EventList'
import { EventModal }        from './_components/EventModal'
import { IcsImportButton }   from './_components/IcsImportButton'
import { useMemberNames }    from '@/hooks/useMemberNames'
import { Button }            from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function CalendarPage() {
  useEffect(() => { document.title = 'Calendar | Household' }, [])

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
    reconnect,
  } = useCalendar()

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Calendar</h1>

        {/* Realtime indicator — subtle pill with retry on error */}
        {rtStatus === 'error' ? (
          <button
            onClick={reconnect}
            className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs text-red-800 transition-colors hover:bg-red-200 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            title="Click to retry connection"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
            Sync error — retry
          </button>
        ) : (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
              rtStatus === 'connected'
                ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
            title={rtStatus === 'connected' ? 'Live sync active' : 'Connecting…'}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                rtStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-400'
              }`}
            />
            {rtStatus === 'connected' ? 'Live' : 'Connecting'}
          </span>
        )}

        {/* ICS import */}
        <IcsImportButton onDone={refresh} />

        {/* View toggle — pill */}
        <div className="flex gap-1 rounded-full bg-muted p-1 text-sm">
          <button
            onClick={() => setView('month')}
            className={`rounded-full px-3 py-1 font-medium transition-all duration-150 ${
              view === 'month'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setView('list')}
            className={`rounded-full px-3 py-1 font-medium transition-all duration-150 ${
              view === 'list'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            List
          </button>
        </div>

        {/* Add button */}
        <Button onClick={() => openAddModal()} size="sm">
          + Add
        </Button>
      </div>

      {/* Month navigation — visible in both views */}
      <div className="mb-4 flex items-center justify-center gap-4">
        <button
          onClick={goToPrevMonth}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Previous month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <h2 className="min-w-44 text-center text-base font-medium">{formatMonthLabel(monthKey)}</h2>
        <button
          onClick={goToNextMonth}
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Next month"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Loading */}
      {status === 'loading' && (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {/* Error */}
      {status === 'error' && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? 'Failed to load events.'}
        </p>
      )}

      {/* Content */}
      {status === 'loaded' && view === 'month' && (
        <Card>
          <CardContent className="p-0">
            <MonthGrid
              monthKey={monthKey}
              events={events}
              onDayClick={openAddModal}
              onEventClick={openEditModal}
            />
          </CardContent>
        </Card>
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
