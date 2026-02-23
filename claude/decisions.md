# Decision Log

## 2026-02-21

Decision: No recurring transactions in MVP.
Reason: Reduces complexity significantly.

## 2026-02-21 — Local-first storage is SQLite

Decision: Use SQLite as the local database for MVP. No backend/auth in MVP.
Implementation target: SQLite WASM in browser with persistent storage (OPFS).
Reason: Strong data integrity + fast summaries + offline + single-user tool.
Consequence: Export/restore is the “sync” mechanism for MVP.

## 2026-02-21

“MVP uses SQLite WASM + OPFS (verified by spike on 2026-02-21)”

“No auth/backend in MVP”

“If pre-migration backup fails → block migration (default)”

## 2026-02-23 — User-managed categories (flexible categories)

**Problem**: Categories were seeded as a static list on first launch (Food & Groceries, Transport, Housing & Utilities, Health, Entertainment, Income). Users had no UI to add custom categories like “Subscriptions”, “Gifts”, or “Side income”. The `categoryRepo.ts` already had full CRUD (insert, update, softDelete, list, get) and `db.client.ts` exposed it — but no page used it.

**Decision**: Expose category management in the Settings page (not a new route).
- Users can **add** categories, with an optional parent for sub-categories.
- Users can **rename** categories (inline edit).
- Users can **delete** categories (soft-delete with inline confirmation).
- Deleting a parent is **blocked** while it still has active children → prevents orphaned sub-categories.

**Why Settings (not a dedicated `/categories` route)**:
Category setup is infrequent — done once, then left alone. A section on the existing Settings page avoids adding a new nav item or route, keeping the app simple.

**Why not inline on the transaction form**:
Keeps the transaction form focused. An inline “create new category” shortcut can be added later if the Settings round-trip proves frustrating in practice.

**1-level nesting preserved**:
The parent dropdown only shows top-level categories, consistent with the existing convention (Decision 007). Children cannot themselves become parents.

**Trade-off**: Editing categories requires navigating to Settings. Acceptable for MVP.
