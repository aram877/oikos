# Calendar

A shared household calendar with a month grid + list view, all-day events
(optional end date and color), realtime sync, and ICS file import that
deduplicates re-imports via a stable `source_uid` per event.

## Routes

| Path        | File                            | Purpose |
|-------------|---------------------------------|---------|
| `/calendar` | `src/app/calendar/page.tsx`     | Month grid / list view toggle, prev/next, modal CRUD, ICS import button. |

## Database

### `public.calendar_events`
Defined in `supabase/add_shopping_and_calendar.sql`. Extended by
`supabase/add_ics_import.sql` (`source_uid`) and
`supabase/add_user_attribution.sql` (`updated_by`).

| Column         | Type        | Notes |
|----------------|-------------|-------|
| `id`           | uuid PK     | |
| `account_id`   | uuid FK     | → `accounts.id` |
| `title`        | text        | non-empty |
| `description`  | text?       | |
| `start_date`   | date        | YYYY-MM-DD |
| `end_date`     | date?       | NULL = single-day; otherwise inclusive |
| `all_day`      | bool        | default `true` |
| `color`        | text?       | hex string |
| `source_uid`   | text?       | unique-per-account dedup key (set by ICS import) |
| `created_by`   | uuid FK?    | → `auth.users.id` |
| `updated_by`   | uuid FK?    | last editor |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | soft delete |

**Constraints**
- Unique `(account_id, source_uid)` (where `source_uid IS NOT NULL`) — ICS
  re-import is idempotent.

**RLS** — Account members manage their account's events.

**Realtime publication** — yes.

## Library — `src/lib/ics.ts`

Pure-TS RFC-5545 parser. Extracts `SUMMARY`, `DESCRIPTION`, `DTSTART`,
`DTEND`, `UID`, `CATEGORIES`, etc., and emits `BulkInsertCalendarEventInput`
rows. **All-day events have an exclusive `DTEND` per RFC, so the parser
subtracts one day to store an inclusive `end_date`.** If `UID` is missing
the parser falls back to a hash of the event so dedup still works.

## Repository — `src/db/repositories/calendarRepo.ts`

| Function | Purpose |
|----------|---------|
| `listByMonth(yearMonth)` | Events overlapping a month (handles multi-day spans). |
| `listUpcoming()` | Next 50 events from today onwards. |
| `insertEvent(input)` | Create with `created_by = auth.uid()`; defaults `all_day = true`, `end_date = null`. |
| `updateEvent(id, partial)` | Sets `updated_by` + `updated_at`. Returns null if soft-deleted. |
| `softDeleteEvent(id)` | Sets `deleted_at`. |
| `bulkInsertEvents(inputs)` | ICS path; uses `ON CONFLICT (account_id, source_uid) DO NOTHING`. |

Exposed on `dbClient.calendar` as `listByMonth`, `listUpcoming`, `insert`,
`update`, `softDelete`, `bulkInsert`.

## React layer

- `src/app/calendar/_hooks/useCalendar.ts` — view toggle, month key, modal
  state, realtime channel, and an `overlapsMonth` filter that includes any
  event whose `[start_date, end_date]` range intersects the visible month.
- `src/app/calendar/_components/MonthGrid.tsx` — day cells with event
  badges; click a cell to add, click an event to edit.
- `src/app/calendar/_components/EventList.tsx` — chronological upcoming list.
- `src/app/calendar/_components/EventModal.tsx` — title, description, start
  / end pickers, all-day toggle, color picker, delete (admin / write).
- `src/app/calendar/_components/IcsImportButton.tsx` — file upload → parse
  preview (count + skipped) → confirm bulk insert.

## How it works

1. **View toggle.** Month vs list. Month view fetches events for the
   current month with `listByMonth`; list view fetches `listUpcoming()`.
2. **Realtime.** The hook subscribes to `INSERT` / `UPDATE` / `DELETE` on
   `calendar_events`; events are filtered locally by month overlap. Soft-
   deleted rows are filtered out client-side (delete events arrive as
   `UPDATE` rows where `deleted_at` is now set).
3. **Modal CRUD.** Click a day → modal in *create* mode prefilled with that
   date. Click an event → *edit* mode. Save → `insertEvent` /
   `updateEvent`; Delete → `softDeleteEvent`.
4. **ICS import.** Pick a file. The parser extracts events, dedupes by
   `source_uid` against the existing list. Confirm → `bulkInsertEvents`
   does an `ON CONFLICT DO NOTHING` upsert.
5. **Color picker.** A small palette; saved as hex on the row, used by the
   grid badge.

## Notable details

- **`end_date` is inclusive.** A 3-day trip Mon–Wed is `start = Mon`,
  `end = Wed`. NULL `end_date` means single day, *not* zero-length.
- **All-day exclusive→inclusive conversion** during ICS import (the parser
  subtracts one day from `DTEND` for all-day events).
- **Soft delete** keeps history. Hard delete only via account cascade.
- **Realtime sync indicator** — same "Live / Connecting / Reconnect" pattern
  as shopping list; 10s timeout.
- **Permissions.** `abilities.calendar` (read/write). Delete is admin-only
  (consistent rule — see [household-members](./household-members.md)).
