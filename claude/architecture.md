# Architecture

Type: Local-first PWA (single user, single device)
Frontend: Next.js + TypeScript
Storage: SQLite (WASM) persisted locally
Backend: None (MVP)
Auth: None (MVP)

Key rules:

- All writes are transactions
- Amounts stored as integer cents
- Schema versioning via PRAGMA user_version + migrations
- Export/restore via versioned JSON backup
