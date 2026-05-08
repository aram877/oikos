# Oikos — Feature Documentation

One Markdown file per feature. Each doc covers what the feature does, the
routes, the database schema, the React/data files, and a step-by-step "how it
works" walk-through.

The application is a multi-user **household app**: a single account is shared
between members (admin / parent / child) with per-feature read/write access.
All data is in Supabase (Postgres + Auth + Realtime + Storage).

## How to read these docs

- The user-visible behaviour and the route paths are at the top of every doc.
- The database schema includes the migration file(s) that introduced or
  modified each table — useful when bootstrapping a fresh project from
  `supabase/full_schema.sql` or applying piecewise to an existing one.
- "How it works" sections are end-to-end flows so you can trace a click to
  a row in Postgres without re-reading the code.

## Index

### Finance

- [Transactions](./transactions.md) — month list, add/edit, soft-delete, the `is_transfer` flag.
- [Search](./search.md) — global text + amount + date + category filters.
- [Budgets](./budgets.md) — monthly cap per category with status colours.
- [Savings goals](./savings-goals.md) — named targets with optional deadlines.
- [Recurring transactions](./recurring-transactions.md) — auto-generate on schedule.
- [CSV import](./csv-import.md) — wizard with auto-detect + dedup.
- [Bank connect (GoCardless)](./bank-connect.md) — institution → requisition → fetch.
- [Accounts / balances](./accounts-balances.md) — checking / savings / net worth derivation.
- [Yearly overview](./yearly-overview.md) — 12-month rollup.
- [Analyst](./analyst.md) — pure-TS report + optional AI commentary.
- [Auto-categorize (AI)](./auto-categorize.md) — batch classifier.
- [Categorization rules](./categorization-rules.md) — description+amount → category.
- [Receipts](./receipts.md) — image / PDF attachments per transaction.
- [Subscriptions](./subscriptions.md) — recurring services with adjustable matching (handles aggregators like Apple Pay).
- [Subscription suggestions](./subscription-suggestions.md) — smart detector that surfaces likely subscriptions in your transactions.

### Household

- [Members & permissions](./household-members.md) — roles, access matrix, abilities.
- [Invitations](./invitations.md) — magic link / sign-up + accept RPC.
- [Profiles](./profiles.md) — display name, DOB, avatar via Storage.
- [Auth](./auth.md) — Supabase Auth, middleware, callback.

### Shared modules

- [Shopping list](./shopping-list.md) — real-time, hard-delete on check-off.
- [Calendar](./calendar.md) — month grid + ICS import.
- [Meal plan](./meal-plan.md) — week grid, slots → meals, bulk-add ingredients.
- [Meal library](./meal-library.md) — meals + ingredients CRUD.
- [Messages](./messages.md) — group chat + DMs with read receipts.
- [Notifications](./notifications.md) — bell with realtime sync.

### Settings & system

- [Categories settings](./categories.md) — tree, defaults, soft-delete.
- [Backup / restore](./backup-restore.md) — JSON export, validating import.
- [AI configuration](./ai-configuration.md) — provider + model picker.
- [Privacy mode](./privacy-mode.md) — masked amounts.
- [Theme](./theme.md) — light / dark / system, no-flash.
- [Push notifications](./push-notifications.md) — VAPID + web-push.
- [PWA](./pwa.md) — manifest + install + service worker.
- [Dashboard](./dashboard.md) — landing surface for budgets, goals, activity.
- [Settings overview](./settings.md) — index of every settings card.

## Cross-cutting conventions

- **Repository pattern** — pages and hooks always go through
  `src/db/db.client.ts` (`dbClient.transactions.list…`); never call Supabase
  directly from the UI layer.
- **Money is integer cents.** `amount_cents` is negative for expenses,
  positive for income. Transfers (`is_transfer = true`) are excluded from
  income/expense summaries.
- **Soft delete** via `deleted_at IS NULL` on most tables. Shopping items are
  the exception (hard delete on check-off).
- **Permissions** are computed centrally in `src/lib/abilities.ts` (role
  ceiling × per-feature access column). The hook `useAbilities()` in
  `src/hooks/useAbilities.ts` returns a typed map for UI gating.
- **Realtime** — Supabase realtime is enabled on `messages`,
  `message_reads`, `notifications`, `account_members`, and shopping/calendar
  tables. Hooks subscribe via `getSupabase().channel(name).on(...).subscribe()`.
- **Migrations** are individual `supabase/*.sql` files concatenated by
  `supabase/build_full_schema.sh` into `supabase/full_schema.sql`. When you
  add or modify a SQL file, update the script's `migrations` array and
  regenerate the full schema in the same commit.
