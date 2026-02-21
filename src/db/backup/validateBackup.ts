import type { BackupFile, ValidationResult } from '../types'
import { BACKUP_VERSION } from '../types'

/**
 * Validates the structure and invariants of a parsed backup object.
 *
 * Does NOT check referential integrity across rows (e.g. account_id existence) —
 * that is enforced at restore time by SQLite foreign-key constraints.
 */
export function validateBackup(raw: unknown): ValidationResult {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Backup is not an object'] }
  }

  const b = raw as Record<string, unknown>

  // ── Top-level fields ────────────────────────────────────────────────────── //

  if (b['version'] !== BACKUP_VERSION) {
    errors.push(
      `Unsupported backup version: ${b['version']} (expected ${BACKUP_VERSION})`,
    )
  }

  if (typeof b['exported_at'] !== 'string' || b['exported_at'] === '') {
    errors.push('Missing or empty exported_at')
  }

  if (typeof b['schema_version'] !== 'number' || b['schema_version'] < 0) {
    errors.push('schema_version must be a non-negative number')
  }

  // ── contents ────────────────────────────────────────────────────────────── //

  if (typeof b['contents'] !== 'object' || b['contents'] === null) {
    errors.push('Missing contents object')
    return { valid: errors.length === 0, errors }
  }

  const contents = b['contents'] as Record<string, unknown>

  if (!Array.isArray(contents['accounts'])) {
    errors.push('contents.accounts must be an array')
  } else {
    contents['accounts'].forEach((row: unknown, i: number) => {
      const r = row as Record<string, unknown>
      if (typeof r['id'] !== 'string') errors.push(`accounts[${i}].id must be a string`)
      if (typeof r['name'] !== 'string') errors.push(`accounts[${i}].name must be a string`)
      if (typeof r['currency'] !== 'string') errors.push(`accounts[${i}].currency must be a string`)
      if (typeof r['created_at'] !== 'string') errors.push(`accounts[${i}].created_at must be a string`)
    })
  }

  if (!Array.isArray(contents['categories'])) {
    errors.push('contents.categories must be an array')
  } else {
    contents['categories'].forEach((row: unknown, i: number) => {
      const r = row as Record<string, unknown>
      if (typeof r['id'] !== 'string') errors.push(`categories[${i}].id must be a string`)
      if (typeof r['name'] !== 'string') errors.push(`categories[${i}].name must be a string`)
      if (typeof r['created_at'] !== 'string') errors.push(`categories[${i}].created_at must be a string`)
    })
  }

  if (!Array.isArray(contents['transactions'])) {
    errors.push('contents.transactions must be an array')
  } else {
    contents['transactions'].forEach((row: unknown, i: number) => {
      const r = row as Record<string, unknown>
      if (typeof r['id'] !== 'string') errors.push(`transactions[${i}].id must be a string`)
      if (typeof r['account_id'] !== 'string') errors.push(`transactions[${i}].account_id must be a string`)
      if (typeof r['amount_cents'] !== 'number') errors.push(`transactions[${i}].amount_cents must be a number`)
      if (typeof r['currency'] !== 'string') errors.push(`transactions[${i}].currency must be a string`)
      if (typeof r['date'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r['date'] as string)) {
        errors.push(`transactions[${i}].date must be YYYY-MM-DD`)
      }
      if (typeof r['description'] !== 'string') errors.push(`transactions[${i}].description must be a string`)
      if (typeof r['created_at'] !== 'string') errors.push(`transactions[${i}].created_at must be a string`)
      if (typeof r['updated_at'] !== 'string') errors.push(`transactions[${i}].updated_at must be a string`)
    })
  }

  return { valid: errors.length === 0, errors }
}
