/**
 * Pure CSV parsing utilities for bank statement import.
 *
 * No dependencies — everything is built from scratch.
 * No React, no DOM APIs beyond File / TextDecoder.
 *
 * Typical usage:
 *   1. readFileText(file)                        → raw text
 *   2. detectSeparator(text)                     → ';' | ',' | '\t'
 *   3. parseCsvText(text, separator, skipRows?)  → CsvData
 *   4. detectDateFormat(sampleValue)             → DateFormat
 *   5. detectAmountLocale(sampleValue)           → AmountLocale
 *   6. mapRows(data, mapping, dateFormat, locale) → MapResult
 */

// ── Types ─────────────────────────────────────────────────────────────────── //

/** How dates are formatted in the source CSV. */
export type DateFormat =
  | 'YYYY-MM-DD'  // ISO 8601 — N26, Revolut
  | 'DD.MM.YYYY'  // German standard — Sparkasse, DKB, Commerzbank
  | 'DD/MM/YYYY'  // European slash — ING-DiBa export
  | 'MM/DD/YYYY'  // US style (rare for German banks)

/** How numbers are formatted in the source CSV. */
export type AmountLocale =
  | 'de'  // Comma = decimal separator: "1.234,56"
  | 'en'  // Period = decimal separator: "1,234.56"

/** User-selected column assignments. */
export interface ColumnMapping {
  dateCol:        string
  descriptionCol: string
  amountCol:      string
  /** Optional — maps a CSV column to category name; '' means no mapping. */
  categoryCol:    string | null
}

/** A single successfully-parsed transaction row. */
export interface ParsedRow {
  date:         string   // YYYY-MM-DD
  description:  string
  amount_cents: number   // negative = expense, positive = income
  import_hash:  string   // FNV-1a stable dedup key
  rawIndex:     number   // 0-based index in CsvData.rows (for error messages)
}

/** A row that failed to parse. */
export interface RowError {
  rowIndex: number
  message:  string
}

/** Result of mapRows(). */
export interface MapResult {
  parsed: ParsedRow[]
  errors: RowError[]
}

/** Parsed CSV: headers + object rows, plus the detected/confirmed separator. */
export interface CsvData {
  headers:   string[]
  rows:      Record<string, string>[]
  separator: string
}

// ── Header-row detection ──────────────────────────────────────────────────── //

/**
 * Keywords that are likely to appear in a financial CSV header row.
 * Used by detectHeaderRow() to skip bank-export preamble lines.
 *
 * Must NOT include short English words that appear inside German ones
 * (e.g. "date" → "Datei", "wert" → "Wertstellungsdatum").
 */
const HEADER_KEYWORDS = [
  // German — booking
  'buchung', 'buchungstag', 'buchungsdatum', 'wertstellung', 'valutadatum',
  // German — parties
  'auftraggeber', 'beguenstigter', 'empfaenger',
  // German — amounts / currency
  'betrag', 'saldo', 'waehrung', 'kontonummer',
  // German — purpose / reference
  'verwendungszweck', 'buchungstext',
  // German — IBAN / BIC
  'iban', 'bic',
  // International (only specific enough strings)
  'payee', 'amount', 'balance', 'debit', 'credit',
  // N26 / Revolut / Wise column names
  'transaction', 'reference', 'currency',
]

/**
 * Scans the first 25 lines of raw CSV text to find the row that best
 * resembles a financial column-header row.
 *
 * Returns the 0-based row index to use as `skipRows` when calling
 * parseCsvText().  Returns 0 if no preamble is detected (safe default).
 *
 * Why: ING, Sparkasse, Commerzbank etc. export a multi-line preamble
 * (IBAN, account name, date range, …) before the actual column headers.
 */
export function detectHeaderRow(text: string, separator: string): number {
  const normalised = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines      = normalised.split('\n').slice(0, 25)

  let bestRow   = 0
  let bestScore = 0

  for (let i = 0; i < lines.length; i++) {
    // Simple split is sufficient here — we only need to count keyword matches,
    // not handle quoted multi-line values.
    const cells = lines[i].split(separator)
    const score = cells.filter(cell => {
      const c = cell.toLowerCase().replace(/['"]/g, '').trim()
      // Whole-cell OR contains match (handles "Auftraggeber/Empfänger")
      return HEADER_KEYWORDS.some(kw => c === kw || c.includes(kw))
    }).length

    if (score > bestScore) {
      bestScore = score
      bestRow   = i
    }
  }

  // Require at least 2 matching cells before trusting the detection.
  return bestScore >= 2 ? bestRow : 0
}

// ── File reading ──────────────────────────────────────────────────────────── //

/**
 * Reads a File as a string.
 * Attempts UTF-8 strict decoding first; falls back to ISO-8859-1 (Latin-1),
 * which is common in older German bank exports (Sparkasse, etc.).
 */
export async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('iso-8859-1').decode(buffer)
  }
}

// ── Separator detection ───────────────────────────────────────────────────── //

/**
 * Counts candidate separators in the first non-empty line and picks the winner.
 * Supported: ';' (German banks), ',' (international), '\t' (tab-delimited).
 */
export function detectSeparator(text: string): ';' | ',' | '\t' {
  const firstLine = text.split('\n').find(l => l.trim() !== '') ?? ''
  const counts: Record<string, number> = {
    ';':  (firstLine.match(/;/g)  ?? []).length,
    ',':  (firstLine.match(/,/g)  ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  }
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return (winner[1] > 0 ? winner[0] : ';') as ';' | ',' | '\t'
}

// ── CSV tokeniser ─────────────────────────────────────────────────────────── //

/**
 * Full RFC 4180-compatible CSV tokeniser.
 * Handles: quoted fields, escaped quotes (""), multi-line quoted values, BOM.
 */
function tokenise(rawText: string, sep: string): string[][] {
  const text      = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const records: string[][] = []
  let record: string[] = []
  let field           = ''
  let inQuotes        = false
  let i               = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        // Escaped double-quote
        field += '"'
        i += 2
        continue
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (text.startsWith(sep, i)) {
        record.push(field.trim())
        field = ''
        i += sep.length
        continue
      } else if (ch === '\n') {
        record.push(field.trim())
        if (record.some(c => c !== '')) records.push(record)
        record = []
        field  = ''
        i++
        continue
      } else {
        field += ch
      }
    }
    i++
  }

  // Flush trailing record
  record.push(field.trim())
  if (record.some(c => c !== '')) records.push(record)

  return records
}

/**
 * Parses a full CSV text into a CsvData object.
 *
 * @param text      Raw file contents.
 * @param separator Field delimiter.
 * @param skipRows  Number of rows to skip *before* the header row.
 *                  Use this for German bank exports that have a preamble
 *                  (e.g. Sparkasse puts account info before the column header).
 */
export function parseCsvText(
  text:      string,
  separator: string,
  skipRows = 0,
): CsvData {
  const records = tokenise(text, separator)
  const relevant = records.slice(skipRows)

  if (relevant.length === 0) {
    return { headers: [], rows: [], separator }
  }

  const headers = relevant[0]
  const rows: Record<string, string>[] = []

  for (let i = 1; i < relevant.length; i++) {
    const record = relevant[i]
    if (record.every(c => c === '')) continue
    const row: Record<string, string> = {}
    headers.forEach((h, j) => { row[h] = record[j] ?? '' })
    rows.push(row)
  }

  return { headers, rows, separator }
}

// ── Date format detection + parsing ──────────────────────────────────────── //

/**
 * Infers the date format from a single sample cell value.
 * Defaults to 'DD.MM.YYYY' when the format cannot be determined (German default).
 */
export function detectDateFormat(sample: string): DateFormat {
  const s = sample.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s))    return 'YYYY-MM-DD'
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) return 'DD.MM.YYYY'
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const day = parseInt(s.split('/')[0], 10)
    return day > 12 ? 'DD/MM/YYYY' : 'DD/MM/YYYY'  // assume European if ambiguous
  }
  return 'DD.MM.YYYY'
}

/**
 * Converts a raw date string to 'YYYY-MM-DD'.
 * Returns null when the value does not match the declared format.
 */
export function parseDate(value: string, format: DateFormat): string | null {
  const s = value.trim()
  if (!s) return null

  switch (format) {
    case 'YYYY-MM-DD': {
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
    }
    case 'DD.MM.YYYY': {
      const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
      if (!m) return null
      return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    case 'DD/MM/YYYY': {
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (!m) return null
      return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    case 'MM/DD/YYYY': {
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (!m) return null
      return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
    }
  }
}

// ── Amount locale detection + parsing ────────────────────────────────────── //

/**
 * Infers the amount number format from a sample cell value.
 *
 * Logic: whichever of comma or period appears *last* is the decimal separator.
 *   "1.234,56" → last separator is ',' → German
 *   "1,234.56" → last separator is '.' → English
 */
export function detectAmountLocale(sample: string): AmountLocale {
  const s = sample.trim().replace(/[+\-\s€$£]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot   = s.lastIndexOf('.')
  if (lastComma > lastDot)   return 'de'
  if (lastDot   > lastComma) return 'en'
  if (lastComma !== -1)      return 'de'  // only commas → German thousands
  if (lastDot   !== -1)      return 'en'  // only dots   → English decimal
  return 'de'                             // no separators → German default
}

/**
 * Parses an amount string into integer cents.
 *
 * - Strips currency symbols, spaces, explicit '+'.
 * - Understands German (1.234,56) and English (1,234.56) formats.
 * - Returns null for empty, non-numeric, or zero values (zero = balance line).
 */
export function parseAmount(value: string, locale: AmountLocale): number | null {
  let s = value.trim()
  if (!s) return null

  const negative = s.startsWith('-')
  s = s.replace(/^[+\-]/, '').trim()
  s = s.replace(/[€$£\s]/g, '')

  if (locale === 'de') {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }

  const parsed = parseFloat(s)
  if (!isFinite(parsed) || parsed === 0) return null

  const cents = Math.round(Math.abs(parsed) * 100)
  return negative ? -cents : cents
}

// ── Import hash (FNV-1a 32-bit) ───────────────────────────────────────────── //

/** FNV-1a 32-bit hash. Deterministic, no crypto overhead. */
function fnv1a32(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash  = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Builds a stable deduplication key from the canonical transaction fields.
 * Same date + description + amount → same hash.
 * Stored in the `import_hash` column; INSERT OR IGNORE skips duplicates.
 */
export function makeImportHash(
  date:        string,
  description: string,
  amountCents: number,
): string {
  const key = `${date}|${description.trim().toLowerCase()}|${amountCents}`
  return fnv1a32(key)
}

// ── Row mapper ────────────────────────────────────────────────────────────── //

/**
 * Applies a ColumnMapping to raw CSV rows and produces ParsedRows.
 *
 * - Rows that cannot be parsed are collected in `errors` (not thrown).
 * - Rows with empty or zero amounts are silently skipped (balance lines, etc.).
 * - Rows with empty descriptions are collected as errors.
 */
export function mapRows(
  data:         CsvData,
  mapping:      ColumnMapping,
  dateFormat:   DateFormat,
  amountLocale: AmountLocale,
): MapResult {
  const parsed: ParsedRow[] = []
  const errors: RowError[]  = []

  data.rows.forEach((row, i) => {
    const rawDate   = row[mapping.dateCol]        ?? ''
    const rawDesc   = row[mapping.descriptionCol] ?? ''
    const rawAmount = row[mapping.amountCol]      ?? ''

    const date = parseDate(rawDate, dateFormat)
    if (!date) {
      errors.push({
        rowIndex: i,
        message:  `Row ${i + 2}: cannot parse date "${rawDate}" as ${dateFormat}`,
      })
      return
    }

    // Silently skip rows with no amount text or zero amount (running balance, etc.)
    if (!rawAmount.trim()) return

    const amount_cents = parseAmount(rawAmount, amountLocale)
    if (amount_cents === null) {
      // Only report an error if the value looks like it should be a number.
      if (/\d/.test(rawAmount)) {
        errors.push({
          rowIndex: i,
          message:  `Row ${i + 2}: cannot parse amount "${rawAmount}"`,
        })
      }
      return
    }

    const description = rawDesc.trim()
    if (!description) {
      errors.push({ rowIndex: i, message: `Row ${i + 2}: description is empty` })
      return
    }

    const import_hash = makeImportHash(date, description, amount_cents)
    parsed.push({ date, description, amount_cents, import_hash, rawIndex: i })
  })

  return { parsed, errors }
}
