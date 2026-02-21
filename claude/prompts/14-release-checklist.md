# Prompt: Release Checklist

Use this before shipping any version of the app, even to yourself.

---

## Data Safety

- [ ] Export works: produces a valid, non-empty JSON file
- [ ] Import works: restoring the export file produces identical data
- [ ] Roundtrip test: export → wipe → restore → verify row counts match
- [ ] Migration: all pending migrations ran cleanly on a fresh install
- [ ] Migration: all pending migrations ran cleanly on an existing database
- [ ] Destructive actions (delete account, delete category) show a confirmation dialog
- [ ] No transaction or account is permanently deleted without explicit user confirmation

## Core Flow Regression

- [ ] Add a transaction manually — appears in list and monthly summary
- [ ] Edit a transaction — changes reflected everywhere (list, summary, chart)
- [ ] Delete a transaction — removed from list and summary
- [ ] Split a transaction across two categories — amounts sum correctly
- [ ] CSV import: upload a sample file, preview looks correct, import completes
- [ ] CSV import: duplicate detection works (re-importing same file adds 0 new rows)
- [ ] Category create / edit / delete works
- [ ] Monthly summary totals match manually summed transactions

## Performance

- [ ] Transaction list with 10 000 rows loads in under 2 seconds
- [ ] Monthly summary query completes in under 500 ms with 10 000 rows
- [ ] CSV import of 2 000 rows completes without UI freeze
- [ ] No memory leak detectable after 10 minutes of normal use (check DevTools)

## Security & Privacy

- [ ] No sensitive data written to `console.log` in production build
- [ ] No third-party network requests made during normal use (check DevTools Network)
- [ ] Auth-protected routes reject unauthenticated requests (if server-backed)
- [ ] CSV import does not execute formula values (no `=cmd()` injection)
- [ ] Error messages shown to users do not include stack traces or internal paths

## Build & Deploy

- [ ] `npm run build` completes without errors or warnings
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] No ESLint errors
- [ ] Environment variables documented in `.env.example`
- [ ] No hardcoded localhost URLs or dev-only secrets in production build

## Manual Test Plan (30 minutes)

1. Fresh install — open app, verify empty state looks correct (5 min)
2. Add 5 transactions across 3 categories, check monthly summary (5 min)
3. Import a CSV file, verify preview and final import (5 min)
4. Export a backup, wipe data, restore from backup (5 min)
5. Test on a slow network or with DevTools throttling enabled (5 min)
6. Test with browser storage cleared mid-session — verify graceful error (5 min)
