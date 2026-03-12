# Household Financial Tracker — Project Overview

A multi-user household financial management app. Families share one "account" (household) and track expenses, a shopping list, and a shared calendar. One member is the admin; others are parents or children with granular feature permissions.

---

## Tech Stack (Current — Next.js)

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Backend/DB | Supabase (Postgres + Auth + Realtime + Storage) |
| Styling | Tailwind CSS |
| AI (optional) | Ollama — llama3.2 (local, for auto-categorisation) |

## Tech Stack (Target — Angular)

| Layer | Recommended |
|-------|------------|
| Framework | Angular 18+ (standalone components) |
| Language | TypeScript |
| Backend/DB | Supabase (same — no backend changes needed) |
| Styling | Tailwind CSS (via `@tailwindcss/vite` or postcss) |
| State | RxJS + Angular Signals (Angular 17+) |
| Routing | Angular Router with Guards |
| HTTP | Supabase JS client (same SDK) |

---

## Features at a Glance

| Feature | Route | Description |
|---------|-------|-------------|
| Dashboard | `/dashboard` | Monthly income/expense/savings overview |
| Transactions | `/transactions` | List, filter, add, edit transactions |
| Import | `/import` | 3-step CSV import wizard |
| Analyst | `/analyst` | AI-generated financial report |
| Shopping | `/shopping` | Real-time shared shopping list |
| Calendar | `/calendar` | Shared event calendar (month + list view, ICS import) |
| Household | `/household` | Member list, permissions (admin), invite |
| Settings | `/settings` | Categories, backup/restore |
| Profile | `/profile` | Display name, DOB, avatar |

---

## Folder Structure (Current — Next.js)

```
src/
  app/
    (pages and API routes, co-located with _hooks/ and _components/)
    transactions/
      _hooks/
      _components/
      page.tsx
    shopping/
    calendar/
    household/
    settings/
    profile/
    analyst/
    import/
    dashboard/
    api/
      invitations/
    auth/
      login/   register/   callback/
    invite/accept/
  db/
    repositories/     ← data access layer
    types.ts          ← all TypeScript interfaces
    db.client.ts      ← typed facade over all repos
    supabase.ts       ← browser Supabase singleton
    accountContext.ts ← cached active account ID
  hooks/              ← shared hooks (useAbilities, useMemberNames)
  lib/
    abilities.ts      ← role/permission logic
    csv.ts            ← CSV parser
    ics.ts            ← ICS/iCal parser
    categorize.ts     ← Ollama integration
    analyst.ts        ← report builder
    supabase/
      client.ts       ← browser client factory
      server.ts       ← server-side client factory
      middleware.ts   ← session refresh helper
  middleware.ts       ← Next.js edge middleware (auth guard)
```

## Suggested Angular Folder Structure

```
src/
  app/
    core/
      supabase.service.ts     ← Supabase client singleton
      auth.service.ts         ← login, register, session, sign-out
      account.service.ts      ← active account ID cache
      abilities.service.ts    ← role/permission checks
      auth.guard.ts           ← route guard
    features/
      transactions/
        transactions.component.ts
        transaction-form.component.ts
        transaction-list.component.ts
        transactions.service.ts
      shopping/
      calendar/
      household/
      settings/
      profile/
      analyst/
      import/
      dashboard/
    shared/
      models/                 ← TypeScript interfaces (from DATA_MODELS.md)
      lib/
        csv.ts
        ics.ts
        abilities.ts
    auth/
      login/
      register/
      callback/
      invite-accept/
  environments/
    environment.ts
    environment.prod.ts
```

---

## Environment Variables

```ts
// src/environments/environment.ts
export const environment = {
  production: false,
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
  siteUrl: 'http://localhost:4200',
}
```

The `SUPABASE_SERVICE_ROLE_KEY` (used for admin invite operations) must stay server-side. In Angular (SPA), you'll need either:
- A small backend/edge function (Supabase Edge Functions recommended), or
- A Supabase Edge Function to handle `POST /invitations` and `DELETE /invitations`

---

## Key Concepts to Map

| Next.js concept | Angular equivalent |
|----------------|--------------------|
| `page.tsx` | Routed component |
| `_hooks/useXxx.ts` | `xxx.service.ts` (Injectable) |
| `useEffect` + cleanup | `ngOnInit` + `ngOnDestroy` + `takeUntilDestroyed()` |
| `useState` | `signal()` or `BehaviorSubject` |
| Context API | `Injectable({ providedIn: 'root' })` service |
| Next.js middleware | `CanActivate` / `CanActivateFn` route guard |
| API routes (`/api/*`) | Supabase Edge Functions or a separate backend |
| `'use client'` directive | Not needed — Angular is always client-side |
| Dynamic routes (`[id]`) | `:id` in Angular Router + `ActivatedRoute` |
