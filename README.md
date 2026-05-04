# Oikos

A multi-user household app. Families share one "account" and track finances, a shopping list, a calendar, meal plans, and household chat. One member is the admin; others are parents or children with granular feature permissions.

## Tech stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Backend / DB:** Supabase (Postgres + Auth + Realtime + Storage)
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **AI (optional):** Claude API, Groq, or local Ollama — for transaction auto-categorization and analyst insights
- **PWA:** installable, with web-push notifications scaffolded

## Features

### Finance

- **Transactions** (`/transactions`) — month-by-month list with sign / category filters, sort by date / description / amount, and a per-month summary (income, expenses, net). Transfers are excluded from the totals and shown in a collapsible section.
- **Add / edit transaction** (`/transactions/new`, `/transactions/:id`) — date, sign, amount, category, description, notes, transfer flag. Soft-delete with two-step confirm.
- **Search** (`/search`) — global text search across all transactions with amount range, date range, and category filters.
- **Budgets** (`/budgets`) — monthly cap per category. Progress bar turns amber at 80% and red when exceeded. Surfaced on the dashboard for the current month.
- **Savings goals** (`/goals`) — named targets (e.g. *Vacation*, *Emergency fund*) with optional deadlines. Top three appear on the dashboard.
- **Recurring transactions** (`/recurring`) — templates that auto-generate transactions on a weekly / biweekly / monthly / yearly schedule. Pause / resume supported. The generator runs once per session per day when you visit `/transactions`.
- **CSV import** (`/import`) — 3-step wizard: upload → map columns → review. Auto-detects separator, header row, date format, decimal separator. Deduplicates via `import_hash`.
- **Bank connect** (`/import?tab=bank`) — GoCardless integration *(work in progress)*.
- **Accounts / balances** (`/accounts`) — checking, savings (estimated from internal transfers), and net worth.
- **Yearly overview** (`/yearly`) — 12-month income / expenses / net table with totals.
- **Analyst** (`/analyst`) — pure-TS report of cash flow, expense breakdown, fixed vs variable, recurring patterns, top merchants, anomalies. Optional AI-written commentary on top.
- **Auto-categorize** — AI batch classifier that fills empty categories using your category list.
- **Categorization rules** (in `/settings`) — match by description substring + optional amount range, automatically tagging future imports.

### Household

- **Members & permissions** (`/household`) — role (admin / parent / child) plus per-feature access (`none` / `read` / `write`) for finance, shopping, calendar, settings, AI, messaging.
- **Invitations** — admin-only, by email. Magic link flow for already-registered users; full sign-up email otherwise. Pending list with revoke.
- **Profiles** (`/profile`) — display name, date of birth, avatar (Supabase Storage).

### Other shared modules

- **Shopping list** (`/shopping`) — real-time shared list. Items are hard-deleted on check-off.
- **Calendar** (`/calendar`) — month grid + list view. Events are all-day with optional end date and color. ICS import dedups via `source_uid`.
- **Meal plan** (`/meal-plan`) — week grid (this / next), assign meals per slot (breakfast / lunch / dinner). Bulk-add ingredients to the shopping list.
- **Meal library** (`/meal-library`) — CRUD of meals + ingredients.
- **Messages** (`/messages`) — group chat + 1-to-1 DMs *(UI partial)*.
- **Notifications** — bell icon with unread count, real-time. Currently used for invitations.

### Privacy & UX

- **Privacy mode** — eye toggle in the header (always visible) plus a checkbox on the sign-in page. When on, every amount across the app renders as random masked characters seeded from the value (stable per amount, no flicker).
- **Theme** — light / dark / system, persisted in localStorage with anti-flash inline script.
- **Error boundary** — global recovery UI instead of a blank page on render errors.
- **Loading skeletons** — for the transactions list and summary cards.

### Settings

- **Categories** — add / edit / soft-delete, parent-child grouping.
- **Categorization rules** — manage description+amount → category mappings.
- **AI configuration** — choose provider (Claude / Groq / Ollama) and model; per-user, persisted in localStorage.
- **Backup / restore** — JSON export of accounts, categories, and transactions; validating import to bulk-restore.

## Project layout

```
src/
  app/                # Next.js App Router pages
    api/              # Server route handlers (AI proxy, invitations, push, gocardless)
    transactions/     # Per-route co-located _hooks, _components, _utils
    ...
  components/         # Shared UI — header, theme + privacy toggles, error boundary, skeletons
  db/
    db.client.ts      # Typed facade — `dbClient.transactions.listByMonth(...)`
    repositories/     # Supabase query helpers per entity
    types.ts          # Row + input interfaces
    backup/           # Export / restore helpers
  hooks/              # Cross-route hooks (abilities, balances, member names)
  lib/
    abilities.ts      # Role + access permission model (well-tested)
    privacy.tsx       # PrivacyProvider + Money component
    recurring.ts      # Recurring transaction generator
    analyst.ts        # Pure-TS financial analysis
    csv.ts, ics.ts    # File parsers
supabase/
  *.sql               # Individual migrations, chronological
  build_full_schema.sh
  full_schema.sql     # Concatenated bootstrap script
```

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in Supabase URL + keys
npm run dev
```

Required env vars (see `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` *(server-only — never prefix with `NEXT_PUBLIC_`)*
- `NEXT_PUBLIC_SITE_URL` *(used for invitation redirects; defaults to `http://localhost:3000`)*

For a fresh Supabase project, paste `supabase/full_schema.sql` into the SQL editor. For an existing project, apply the new individual `supabase/*.sql` files in chronological order (see `build_full_schema.sh`).

## Scripts

| Command | Action |
|---------|--------|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit tests) |
| `bash supabase/build_full_schema.sh` | Regenerate `full_schema.sql` from individual migrations |

## Conventions

- Repository pattern in `src/db/repositories/` — pages and hooks always go through `dbClient`, never call Supabase directly.
- Money is stored as integer cents (`amount_cents`); negative = expense, positive = income, transfers excluded from summaries.
- Soft delete via `deleted_at IS NULL` on most tables; shopping items are an exception (hard delete).
- Permissions are computed in `src/lib/abilities.ts` (role ceiling × per-feature access column). Tests in `abilities.test.ts`.
- When adding or modifying a `supabase/*.sql` file: append it to `build_full_schema.sh`, regenerate `full_schema.sql`, and commit all three together.
