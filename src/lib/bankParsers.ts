/**
 * Bank-specific CSV parsers — no user column-mapping required.
 *
 * detectBank(text)              → DetectedBank | null
 * parseKnownBank(text, bankId)  → BankParseResult
 *
 * Supported:
 *   ing        — ING Germany (Umsatzanzeige export)
 *   dkb        — Deutsche Kreditbank
 *   sparkasse  — Sparkasse (semicolon variants)
 *   volksbank  — Volksbank / Raiffeisenbank
 *   n26        — N26
 *   revolut    — Revolut
 */

import type { ParsedRow } from './csv'
import { makeImportHash } from './csv'

export type BankId = 'ing' | 'dkb' | 'sparkasse' | 'volksbank' | 'n26' | 'revolut'

export interface DetectedBank {
  id: BankId
  name: string
}

export interface BankParseResult {
  rows: ParsedRow[]
  skippedCount: number
}

// ── Internal helpers ─────────────────────────────────────────────────────── //

function clean(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function nonEmptyLines(text: string): string[] {
  return clean(text).split('\n').filter(l => l.trim() !== '')
}

/** RFC-4180-ish line splitter with quoted-field support. */
function splitLine(line: string, sep: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"')                    { inQ = false }
      else                                    { field += ch }
    } else {
      if (ch === '"')                         { inQ = true }
      else if (line.startsWith(sep, i))       { fields.push(field.trim()); field = ''; i += sep.length - 1 }
      else                                    { field += ch }
    }
  }
  fields.push(field.trim())
  return fields
}

function parseGermanDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function parseIsoDate(s: string): string | null {
  const d = s.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

function parseGermanAmount(s: string): number | null {
  let v = s.trim().replace(/[€\s"]/g, '')
  if (!v) return null
  const neg = v.startsWith('-')
  v = v.replace(/^[+-]/, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(v)
  if (!isFinite(n) || n === 0) return null
  return neg ? -Math.round(n * 100) : Math.round(n * 100)
}

function parseEnglishAmount(s: string): number | null {
  // Revolut / N26 sometimes use unicode minus (U+2212)
  let v = s.trim().replace(/[€$£\s"]/g, '').replace('−', '-')
  if (!v) return null
  const neg = v.startsWith('-')
  v = v.replace(/^[+-]/, '').replace(/,/g, '')
  const n = parseFloat(v)
  if (!isFinite(n) || n === 0) return null
  return neg ? -Math.round(n * 100) : Math.round(n * 100)
}

/** Find the first column index whose lowercased value includes any of the needles. */
function colIdx(headers: string[], ...needles: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const needle of needles) {
    const i = lower.findIndex(h => h === needle || h.includes(needle))
    if (i >= 0) return i
  }
  return -1
}

/** Find the LAST column index matching any needle (handles duplicate header names). */
function lastColIdx(headers: string[], ...needles: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (let i = lower.length - 1; i >= 0; i--) {
    for (const needle of needles) {
      if (lower[i] === needle || lower[i].includes(needle)) return i
    }
  }
  return -1
}

/** Generic row builder shared across parsers. */
function buildRows(
  lines:       string[],
  startIdx:    number,
  sep:         string,
  dateIdx:     number,
  descIdx:     number,
  amtIdx:      number,
  parseDateFn: (s: string) => string | null,
  parseAmtFn:  (s: string) => number | null,
  descFallback = -1,
): BankParseResult {
  const rows: ParsedRow[] = []
  let skippedCount = 0

  for (let i = startIdx; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep)
    const date = parseDateFn(cells[dateIdx] ?? '')
    let description = (cells[descIdx] ?? '').trim()
    if (!description && descFallback >= 0) description = (cells[descFallback] ?? '').trim()
    const amount_cents = parseAmtFn(cells[amtIdx] ?? '')

    if (!date || !description || amount_cents === null) { skippedCount++; continue }

    rows.push({
      date,
      description,
      amount_cents,
      import_hash: makeImportHash(date, description, amount_cents),
      rawIndex:    i - startIdx,
    })
  }

  return { rows, skippedCount }
}

// ── ING Germany ──────────────────────────────────────────────────────────── //
// First line: "Umsatzanzeige;Datei erstellt am: ..."
// Header:     Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;
//             Verwendungszweck;Saldo;Währung;Betrag;Währung

function detectING(lines: string[]): boolean {
  return lines.length > 0 && lines[0].toLowerCase().startsWith('umsatzanzeige')
}

function parseING(text: string): BankParseResult {
  const lines = nonEmptyLines(text)
  const hi = lines.findIndex(l => {
    const c = splitLine(l, ';').map(h => h.toLowerCase().trim())
    return c.includes('buchung') && c.includes('betrag')
  })
  if (hi < 0) return { rows: [], skippedCount: 0 }

  const hdr   = splitLine(lines[hi], ';')
  const dateI = colIdx(hdr, 'buchung')
  const descI = colIdx(hdr, 'auftraggeber')
  const amtI  = lastColIdx(hdr, 'betrag')    // last "Betrag" — not "Saldo"
  const purpI = colIdx(hdr, 'verwendungszweck')

  if (dateI < 0 || descI < 0 || amtI < 0) return { rows: [], skippedCount: 0 }
  return buildRows(lines, hi + 1, ';', dateI, descI, amtI, parseGermanDate, parseGermanAmount, purpI)
}

// ── DKB ──────────────────────────────────────────────────────────────────── //
// Preamble with account info, then:
// Header: Buchungstag;Wertstellung;Buchungstext;Auftraggeber / Begünstigter;
//         Kontonummer / IBAN;BIC;Betrag (EUR);...

function detectDKB(lines: string[]): boolean {
  return lines.some(l => splitLine(l, ';').some(h => h.toLowerCase().includes('betrag (eur)')))
}

function parseDKB(text: string): BankParseResult {
  const lines = nonEmptyLines(text)
  const hi = lines.findIndex(l => splitLine(l, ';').some(h => h.toLowerCase().includes('betrag (eur)')))
  if (hi < 0) return { rows: [], skippedCount: 0 }

  const hdr   = splitLine(lines[hi], ';')
  const dateI = colIdx(hdr, 'buchungstag')
  const descI = colIdx(hdr, 'auftraggeber')
  const amtI  = colIdx(hdr, 'betrag (eur)')
  const fallI = colIdx(hdr, 'buchungstext', 'verwendungszweck')

  if (dateI < 0 || amtI < 0) return { rows: [], skippedCount: 0 }
  const realDescI = descI >= 0 ? descI : fallI
  if (realDescI < 0) return { rows: [], skippedCount: 0 }

  return buildRows(lines, hi + 1, ';', dateI, realDescI, amtI, parseGermanDate, parseGermanAmount, fallI)
}

// ── Sparkasse ────────────────────────────────────────────────────────────── //
// Many branch variants; all use semicolons and have "BLZ" + "Buchungstag" in
// the same header row (distinguishes from DKB which has "Betrag (EUR)").

function detectSparkasse(lines: string[]): boolean {
  return lines.some(l => {
    const cells = splitLine(l, ';').map(h => h.toLowerCase().trim())
    return cells.some(h => h === 'blz' || h.includes('blz')) &&
           cells.some(h => h.includes('buchungstag') || h.includes('buchungsdatum'))
  })
}

function parseSparkasse(text: string): BankParseResult {
  const lines = nonEmptyLines(text)
  const hi = lines.findIndex(l => {
    const cells = splitLine(l, ';').map(h => h.toLowerCase().trim())
    return (cells.some(h => h.includes('buchungstag') || h.includes('buchungsdatum'))) &&
           cells.some(h => h === 'betrag' || h.includes('betrag'))
  })
  if (hi < 0) return { rows: [], skippedCount: 0 }

  const hdr   = splitLine(lines[hi], ';')
  const dateI = colIdx(hdr, 'buchungstag', 'buchungsdatum')
  const descI = colIdx(hdr, 'auftraggeber', 'beguenstigter', 'begünstigter', 'zahlungsempfänger')
  const amtI  = colIdx(hdr, 'betrag')
  const purpI = colIdx(hdr, 'verwendungszweck')

  if (dateI < 0 || amtI < 0) return { rows: [], skippedCount: 0 }
  const realDescI = descI >= 0 ? descI : purpI
  if (realDescI < 0) return { rows: [], skippedCount: 0 }

  return buildRows(lines, hi + 1, ';', dateI, realDescI, amtI, parseGermanDate, parseGermanAmount, purpI)
}

// ── Volksbank / Raiffeisenbank ────────────────────────────────────────────── //
// Header: Bezeichnung Auftragskonto;IBAN Auftragskonto;BIC Auftragskonto;
//         Bankname Auftragskonto;Buchungstag;Valutadatum;Name Zahlungsbeteiligter;
//         IBAN Zahlungsbeteiligter;BIC Zahlungsbeteiligter;Buchungstext;
//         Verwendungszweck;Betrag;Waehrung;...

function detectVolksbank(lines: string[]): boolean {
  return lines.some(l => {
    const cells = splitLine(l, ';').map(h => h.toLowerCase().trim())
    return cells.some(h => h.includes('iban auftragskonto')) ||
           cells.some(h => h.includes('name zahlungsbeteiligter'))
  })
}

function parseVolksbank(text: string): BankParseResult {
  const lines = nonEmptyLines(text)
  const hi = lines.findIndex(l => {
    const cells = splitLine(l, ';').map(h => h.toLowerCase().trim())
    return cells.some(h => h.includes('buchungstag')) &&
           (cells.some(h => h === 'betrag') || cells.some(h => h.includes('betrag')))
  })
  if (hi < 0) return { rows: [], skippedCount: 0 }

  const hdr   = splitLine(lines[hi], ';')
  const dateI = colIdx(hdr, 'buchungstag')
  const descI = colIdx(hdr, 'name zahlungsbeteiligter', 'auftraggeber', 'beguenstigter')
  const amtI  = colIdx(hdr, 'betrag')
  const purpI = colIdx(hdr, 'verwendungszweck', 'buchungstext')

  if (dateI < 0 || amtI < 0) return { rows: [], skippedCount: 0 }
  const realDescI = descI >= 0 ? descI : purpI
  if (realDescI < 0) return { rows: [], skippedCount: 0 }

  return buildRows(lines, hi + 1, ';', dateI, realDescI, amtI, parseGermanDate, parseGermanAmount, purpI)
}

// ── N26 ──────────────────────────────────────────────────────────────────── //
// Header (comma): "Date","Payee","Account number","Transaction type",
//                 "Payment reference","Amount (EUR)"  (or with "Category" column)

function detectN26(lines: string[]): boolean {
  if (lines.length === 0) return false
  const first = lines[0].toLowerCase()
  return first.includes('payee') && first.includes('transaction type')
}

function parseN26(text: string): BankParseResult {
  const lines = nonEmptyLines(text)
  if (lines.length < 2) return { rows: [], skippedCount: 0 }

  const hdr   = splitLine(lines[0], ',')
  const dateI = colIdx(hdr, 'date')
  const descI = colIdx(hdr, 'payee')
  const amtI  = colIdx(hdr, 'amount (eur)', 'amount')
  const refI  = colIdx(hdr, 'payment reference')

  if (dateI < 0 || amtI < 0) return { rows: [], skippedCount: 0 }
  const realDescI = descI >= 0 ? descI : refI
  if (realDescI < 0) return { rows: [], skippedCount: 0 }

  return buildRows(lines, 1, ',', dateI, realDescI, amtI, parseIsoDate, parseEnglishAmount, refI)
}

// ── Revolut ──────────────────────────────────────────────────────────────── //
// Header (comma): Type,Product,Started Date,Completed Date,Description,
//                 Amount,Fee,Currency,State,Balance

function detectRevolut(lines: string[]): boolean {
  if (lines.length === 0) return false
  const first = lines[0].toLowerCase()
  return first.includes('started date') && first.includes('state')
}

function parseRevolut(text: string): BankParseResult {
  const lines = nonEmptyLines(text)
  if (lines.length < 2) return { rows: [], skippedCount: 0 }

  const hdr    = splitLine(lines[0], ',')
  const dateI  = colIdx(hdr, 'completed date', 'started date')
  const descI  = colIdx(hdr, 'description')
  const amtI   = colIdx(hdr, 'amount')
  const stateI = colIdx(hdr, 'state')

  if (dateI < 0 || descI < 0 || amtI < 0) return { rows: [], skippedCount: 0 }

  const rows: ParsedRow[] = []
  let skippedCount = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], ',')
    if (stateI >= 0 && (cells[stateI] ?? '').toLowerCase() !== 'completed') {
      skippedCount++
      continue
    }
    const date        = parseIsoDate(cells[dateI] ?? '')
    const description = (cells[descI] ?? '').trim()
    const amount_cents = parseEnglishAmount(cells[amtI] ?? '')
    if (!date || !description || amount_cents === null) { skippedCount++; continue }
    rows.push({ date, description, amount_cents, import_hash: makeImportHash(date, description, amount_cents), rawIndex: i - 1 })
  }

  return { rows, skippedCount }
}

// ── Public API ───────────────────────────────────────────────────────────── //

const BANKS: {
  id:     BankId
  name:   string
  detect: (lines: string[]) => boolean
  parse:  (text: string)    => BankParseResult
}[] = [
  { id: 'ing',       name: 'ING',                   detect: detectING,       parse: parseING       },
  { id: 'dkb',       name: 'DKB',                   detect: detectDKB,       parse: parseDKB       },
  { id: 'volksbank', name: 'Volksbank/Raiffeisenbank', detect: detectVolksbank, parse: parseVolksbank },
  { id: 'sparkasse', name: 'Sparkasse',              detect: detectSparkasse, parse: parseSparkasse },
  { id: 'n26',       name: 'N26',                   detect: detectN26,       parse: parseN26       },
  { id: 'revolut',   name: 'Revolut',               detect: detectRevolut,   parse: parseRevolut   },
]

export function detectBank(text: string): DetectedBank | null {
  const lines = nonEmptyLines(text)
  for (const bank of BANKS) {
    if (bank.detect(lines)) return { id: bank.id, name: bank.name }
  }
  return null
}

export function parseKnownBank(text: string, bankId: BankId): BankParseResult {
  const bank = BANKS.find(b => b.id === bankId)
  if (!bank) return { rows: [], skippedCount: 0 }
  return bank.parse(text)
}
