import type { OpfsSAHPoolDatabase } from '@sqlite.org/sqlite-wasm'
import type { Migration } from './index'

/**
 * Migration v1 — initial schema.
 *
 * Tables: accounts, categories, transactions
 * No users table: single-user tool, no auth in MVP.
 *
 * Design notes:
 * - All IDs are UUIDs (TEXT) generated in TypeScript via crypto.randomUUID().
 * - All amounts are INTEGER cents (negative = expense, positive = income).
 * - All dates are TEXT in ISO-8601 format (YYYY-MM-DD for dates,
 *   full datetime for timestamps).
 * - Soft deletes via deleted_at; hard deletes are never used.
 * - Partial indexes (WHERE deleted_at IS NULL) keep active-row queries fast.
 */
export const migration_000_init: Migration = {
  version: 1,

  run(db: OpfsSAHPoolDatabase): void {
    db.exec(`
      -- ── Accounts ───────────────────────────────────────────────────────── --
      CREATE TABLE accounts (
        id         TEXT    NOT NULL PRIMARY KEY,
        name       TEXT    NOT NULL,
        currency   TEXT    NOT NULL DEFAULT 'EUR',
        created_at TEXT    NOT NULL,
        deleted_at TEXT
      );

      -- ── Categories (one level of parent/child) ─────────────────────────── --
      CREATE TABLE categories (
        id         TEXT    NOT NULL PRIMARY KEY,
        name       TEXT    NOT NULL,
        parent_id  TEXT    REFERENCES categories(id),
        created_at TEXT    NOT NULL,
        deleted_at TEXT
      );

      -- ── Transactions ────────────────────────────────────────────────────── --
      CREATE TABLE transactions (
        id           TEXT    NOT NULL PRIMARY KEY,
        account_id   TEXT    NOT NULL REFERENCES accounts(id),
        category_id  TEXT    REFERENCES categories(id),
        amount_cents INTEGER NOT NULL,
        currency     TEXT    NOT NULL DEFAULT 'EUR',
        date         TEXT    NOT NULL,
        description  TEXT    NOT NULL,
        notes        TEXT,
        import_hash  TEXT,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        deleted_at   TEXT
      );

      -- ── Indexes ─────────────────────────────────────────────────────────── --

      -- Monthly list query: WHERE date >= ? AND date < ? AND deleted_at IS NULL
      CREATE INDEX idx_tx_date
        ON transactions(date)
        WHERE deleted_at IS NULL;

      -- Filter by account (account detail view)
      CREATE INDEX idx_tx_account
        ON transactions(account_id)
        WHERE deleted_at IS NULL;

      -- Filter by category (category drilldown)
      CREATE INDEX idx_tx_category
        ON transactions(category_id)
        WHERE deleted_at IS NULL;

      -- CSV duplicate detection: WHERE import_hash = ?
      CREATE UNIQUE INDEX idx_tx_import_hash
        ON transactions(import_hash)
        WHERE import_hash IS NOT NULL;

      -- Monthly summary: covering index for (date, amount_cents, category_id)
      -- Avoids a table scan when aggregating by category within a date range.
      CREATE INDEX idx_tx_summary
        ON transactions(date, category_id, amount_cents)
        WHERE deleted_at IS NULL;
    `)
  },
}
