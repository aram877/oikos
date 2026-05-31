'use client'

/**
 * /import — 3-step CSV import wizard.
 *
 * Step 1 — Upload:   File picker + raw preview, separator + skip-rows config.
 * Step 2 — Map:      Column assignment, date/amount format selectors, live preview.
 * Step 3 — Review:   Duplicate check, account selection, bulk insert.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BankConnect } from './_components/BankConnect'
import {
  readFileText,
  detectSeparator,
  detectHeaderRow,
  parseCsvText,
  detectDateFormat,
  detectAmountLocale,
  mapRows,
} from '@/lib/csv'
import type {
  CsvData,
  ColumnMapping,
  DateFormat,
  AmountLocale,
  MapResult,
  ParsedRow,
} from '@/lib/csv'
import { detectBank, parseKnownBank } from '@/lib/bankParsers'
import type { DetectedBank } from '@/lib/bankParsers'
import { dbClient } from '@/db/db.client'
import type { AccountRow, InsertTransactionInput } from '@/db/types'

// ── Types ─────────────────────────────────────────────────────────────────── //

type Step = 'upload' | 'map' | 'review' | 'done'

// ── Helpers ───────────────────────────────────────────────────────────────── //

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
function formatEur(cents: number) { return eurFmt.format(cents / 100) }

function sepLabel(s: string) {
  if (s === ';')   return 'Semicolon (;)'
  if (s === ',')   return 'Comma (,)'
  if (s === '\t')  return 'Tab'
  return s
}

// ── Component ─────────────────────────────────────────────────────────────── //

export default function ImportPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // Switch to bank tab if returning from GoCardless redirect
  const hasReturn = searchParams.get('tab') === 'bank'
  const [source, setSource] = useState<'csv' | 'bank'>(hasReturn ? 'bank' : 'csv')

  // ── DB init ─────────────────────────────────────────────────────────────── //
  const [dbReady,   setDbReady]   = useState(false)
  const [accounts,  setAccounts]  = useState<AccountRow[]>([])
  const [accountId, setAccountId] = useState<string>('')

  useEffect(() => {
    dbClient.init()
      .then(() => dbClient.accounts.list())
      .then(accs => {
        setAccounts(accs)
        if (accs.length > 0) setAccountId(accs[0].id)
        setDbReady(true)
      })
      .catch(console.error)
  }, [])

  // ── Step ─────────────────────────────────────────────────────────────────── //
  const [step, setStep] = useState<Step>('upload')

  // ── Step 1: Upload state ─────────────────────────────────────────────────── //
  const [fileName,      setFileName]      = useState<string>('')
  const [rawText,       setRawText]       = useState<string>('')
  const [separator,     setSeparator]     = useState<';' | ',' | '\t'>(';')
  const [skipRows,      setSkipRows]      = useState<number>(0)
  const [isDragging,    setIsDragging]    = useState(false)
  const [parseError,    setParseError]    = useState<string | null>(null)
  const [detectedBank,  setDetectedBank]  = useState<DetectedBank | null>(null)
  const [bankRowCount,  setBankRowCount]  = useState<number>(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Step 2: Map state ────────────────────────────────────────────────────── //
  const [csvData,      setCsvData]      = useState<CsvData | null>(null)
  const [dateCol,      setDateCol]      = useState<string>('')
  const [descCol,      setDescCol]      = useState<string>('')
  const [amountCol,    setAmountCol]    = useState<string>('')
  const [categoryCol,  setCategoryCol]  = useState<string>('')
  const [dateFormat,   setDateFormat]   = useState<DateFormat>('DD.MM.YYYY')
  const [amountLocale, setAmountLocale] = useState<AmountLocale>('de')

  // ── Step 3: Review state ─────────────────────────────────────────────────── //
  const [mapResult,       setMapResult]       = useState<MapResult | null>(null)
  const [duplicateHashes, setDuplicateHashes] = useState<Set<string>>(new Set())
  const [importing,       setImporting]       = useState(false)
  const [importError,     setImportError]     = useState<string | null>(null)
  const [importedCount,   setImportedCount]   = useState<number>(0)

  // ── File processing (Step 1 → Step 2) ───────────────────────────────────── //

  const processFile = useCallback(async (file: File) => {
    setParseError(null)
    setDetectedBank(null)
    setBankRowCount(0)
    try {
      const text       = await readFileText(file)
      const sep        = detectSeparator(text)
      const headerRow  = detectHeaderRow(text, sep)
      setFileName(file.name)
      setRawText(text)
      setSeparator(sep)
      setSkipRows(headerRow)

      const bank = detectBank(text)
      if (bank) {
        const result = parseKnownBank(text, bank.id)
        setDetectedBank(bank)
        setBankRowCount(result.rows.length)
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // Re-parse whenever separator or skipRows changes while on upload step.
  const csvPreview = rawText
    ? parseCsvText(rawText, separator, skipRows)
    : null

  // ── Bank-detected fast path: skip straight to Review ────────────────────── //

  async function handleBankDetectContinue() {
    if (!rawText || !detectedBank) return
    const result = parseKnownBank(rawText, detectedBank.id)
    setMapResult({ parsed: result.rows, errors: [] })
    const hashes = result.rows.map(r => r.import_hash)
    try {
      const existing = await dbClient.transactions.checkImportHashes(hashes)
      setDuplicateHashes(new Set(existing))
    } catch {
      setDuplicateHashes(new Set())
    }
    setStep('review')
  }

  // ── Continue from Upload to Map ──────────────────────────────────────────── //

  function handleUploadContinue() {
    if (!rawText) return
    const data = parseCsvText(rawText, separator, skipRows)
    if (data.headers.length === 0 || data.rows.length === 0) {
      setParseError('No data rows found. Try adjusting the separator or skip-rows setting.')
      return
    }

    setCsvData(data)

    // Auto-select sensible defaults by fuzzy-matching header names.
    const h = data.headers
    const find = (...keywords: string[]) =>
      h.find(col => keywords.some(kw => col.toLowerCase().includes(kw.toLowerCase()))) ?? ''

    // 'buchung' comes first so ING's "Buchung" wins over "Wertstellungsdatum".
    // 'date' is intentionally left out — it false-matches German "Datei" (= file).
    const detectedDateCol = find(
      'buchung', 'buchungstag', 'buchungsdatum', 'buchungsdatum',
      'datum', 'valuta', 'wertstellung',
    )
    const detectedDescCol = find(
      'auftraggeber', 'beguenstigter', 'empfaenger', 'empfänger', 'begünstigter',
      'payee', 'description', 'buchungstext',
    )
    // 'wert' removed — too short, false-matches "Wertstellungsdatum".
    // 'umsatz' removed — false-matches "Umsatzanzeige" (ING preamble title).
    const detectedAmtCol = find('betrag', 'amount', 'debit', 'credit')

    setDateCol(detectedDateCol   || h[0]  || '')
    setDescCol(detectedDescCol   || h[1]  || '')
    setAmountCol(detectedAmtCol  || h[2]  || '')
    setCategoryCol('')

    // Auto-detect formats from first data row.
    const firstRow = data.rows[0]
    if (firstRow) {
      if (detectedDateCol && firstRow[detectedDateCol]) {
        setDateFormat(detectDateFormat(firstRow[detectedDateCol]))
      }
      if (detectedAmtCol && firstRow[detectedAmtCol]) {
        setAmountLocale(detectAmountLocale(firstRow[detectedAmtCol]))
      }
    }

    setStep('map')
  }

  // ── Continue from Map to Review ──────────────────────────────────────────── //

  async function handleMapContinue() {
    if (!csvData || !dateCol || !descCol || !amountCol) return

    const mapping: ColumnMapping = {
      dateCol,
      descriptionCol: descCol,
      amountCol,
      categoryCol:    categoryCol || null,
    }

    const result = mapRows(csvData, mapping, dateFormat, amountLocale)
    setMapResult(result)

    // Check for duplicates against the live DB.
    const hashes = result.parsed.map(r => r.import_hash)
    try {
      const existing = await dbClient.transactions.checkImportHashes(hashes)
      setDuplicateHashes(new Set(existing))
    } catch {
      setDuplicateHashes(new Set())
    }

    setStep('review')
  }

  // ── Import ───────────────────────────────────────────────────────────────── //

  async function handleImport() {
    if (!mapResult || !accountId) return
    setImporting(true)
    setImportError(null)

    const newRows = mapResult.parsed.filter(r => !duplicateHashes.has(r.import_hash))

    const inputs: InsertTransactionInput[] = newRows.map(r => ({
      account_id:   accountId,
      category_id:  null,
      amount_cents: r.amount_cents,
      date:         r.date,
      description:  r.description,
      notes:        null,
      import_hash:  r.import_hash,
    }))

    try {
      const count = await dbClient.transactions.insertBulk(inputs)
      setImportedCount(count)
      setStep('done')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  // ── Drag-and-drop handlers ───────────────────────────────────────────────── //

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }
  function onDragLeave() { setIsDragging(false) }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  // ── Render ───────────────────────────────────────────────────────────────── //

  if (!dbReady) {
    return (
      <Shell step={step} source={source} onSwitchSource={setSource}>
        <p className="py-12 text-center text-sm text-neutral-500">Opening database…</p>
      </Shell>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────── //
  if (step === 'done') {
    return (
      <Shell step={step} source={source} onSwitchSource={setSource}>
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-base font-medium">
            {importedCount} transaction{importedCount !== 1 ? 's' : ''} imported
          </p>
          <Link
            href="/transactions"
            className="rounded bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            View transactions
          </Link>
        </div>
      </Shell>
    )
  }

  // ── Review ───────────────────────────────────────────────────────────────── //
  if (step === 'review' && mapResult) {
    const newRows  = mapResult.parsed.filter(r => !duplicateHashes.has(r.import_hash))
    const dupCount = mapResult.parsed.length - newRows.length
    const preview  = newRows.slice(0, 25)

    return (
      <Shell step={step} source={source} onSwitchSource={setSource}>
        {/* Summary chips */}
        <div className="mb-5 flex flex-wrap gap-3 text-sm">
          {detectedBank && (
            <Chip color="green">{detectedBank.name} auto-parsed</Chip>
          )}
          <Chip color="neutral">{mapResult.parsed.length} transactions parsed</Chip>
          <Chip color="green">{newRows.length} new</Chip>
          {dupCount > 0 && (
            <Chip color="yellow">{dupCount} already imported (skipped)</Chip>
          )}
          {mapResult.errors.length > 0 && (
            <Chip color="red">{mapResult.errors.length} rows skipped (errors)</Chip>
          )}
        </div>

        {/* Account picker (only shown when there are multiple accounts) */}
        {accounts.length > 1 && (
          <label className="mb-5 flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Import into account
            </span>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        )}

        {/* Preview table */}
        {newRows.length > 0 && (
          <div className="mb-5 overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900">
                <tr>
                  <Th>Date</Th>
                  <Th>Description</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {preview.map((r, i) => (
                  <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <Td>{r.date}</Td>
                    <Td>{r.description}</Td>
                    <Td align="right">
                      <span className={r.amount_cents < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'}>
                        {formatEur(r.amount_cents)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {newRows.length > preview.length && (
              <p className="px-4 py-2 text-xs text-neutral-500">
                … and {newRows.length - preview.length} more
              </p>
            )}
          </div>
        )}

        {/* Errors accordion */}
        {mapResult.errors.length > 0 && (
          <details className="mb-5">
            <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
              {mapResult.errors.length} rows with parse errors (click to expand)
            </summary>
            <ul className="mt-2 space-y-1 pl-4 text-xs text-red-600 dark:text-red-400">
              {mapResult.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          </details>
        )}

        {importError && (
          <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {importError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing || newRows.length === 0}
            className="rounded bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {importing ? 'Importing…' : `Import ${newRows.length} transaction${newRows.length !== 1 ? 's' : ''}`}
          </button>
          <button
            onClick={() => setStep('map')}
            disabled={importing}
            className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            ← Back
          </button>
        </div>
      </Shell>
    )
  }

  // ── Map ──────────────────────────────────────────────────────────────────── //
  if (step === 'map' && csvData) {
    const canContinue = dateCol && descCol && amountCol

    // Live preview with current mapping
    const previewResult = canContinue
      ? mapRows(
          { ...csvData, rows: csvData.rows.slice(0, 5) },
          { dateCol, descriptionCol: descCol, amountCol, categoryCol: categoryCol || null },
          dateFormat,
          amountLocale,
        )
      : null

    return (
      <Shell step={step} source={source} onSwitchSource={setSource}>

        <div className="flex flex-col gap-5">

          {/* Column selectors */}
          <ColSelect
            label="Date column"
            value={dateCol}
            onChange={setDateCol}
            headers={csvData.headers}
            required
          />
          <ColSelect
            label="Description column"
            value={descCol}
            onChange={setDescCol}
            headers={csvData.headers}
            required
          />
          <ColSelect
            label="Amount column"
            value={amountCol}
            onChange={setAmountCol}
            headers={csvData.headers}
            required
          />
          <ColSelect
            label="Category column (optional)"
            value={categoryCol}
            onChange={setCategoryCol}
            headers={csvData.headers}
            includeNone
          />

          {/* Format selectors */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Date format
              </span>
              <select
                value={dateFormat}
                onChange={e => setDateFormat(e.target.value as DateFormat)}
                className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="DD.MM.YYYY">DD.MM.YYYY (German)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Number format
              </span>
              <select
                value={amountLocale}
                onChange={e => setAmountLocale(e.target.value as AmountLocale)}
                className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="de">German  (1.234,56)</option>
                <option value="en">English (1,234.56)</option>
              </select>
            </label>
          </div>

          {/* Live preview */}
          {previewResult && previewResult.parsed.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                Preview (first rows)
              </p>
              <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-900">
                    <tr>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {previewResult.parsed.map((r, i) => (
                      <tr key={i}>
                        <Td>{r.date}</Td>
                        <Td>{r.description}</Td>
                        <Td align="right">
                          <span className={r.amount_cents < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'}>
                            {formatEur(r.amount_cents)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewResult.errors.length > 0 && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {previewResult.errors.length} row(s) failed to parse in preview.
                </p>
              )}
            </div>
          )}

          {previewResult && previewResult.parsed.length === 0 && canContinue && (
            <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              No rows could be parsed with current settings. Check the column assignments and formats above.
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleMapContinue}
              disabled={!canContinue}
              className="rounded bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              Continue →
            </button>
            <button
              onClick={() => setStep('upload')}
              className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            >
              ← Back
            </button>
          </div>

        </div>
      </Shell>
    )
  }

  // ── Bank import ───────────────────────────────────────────────────────────── //

  if (source === 'bank') {
    return (
      <Shell step={step} source={source} onSwitchSource={setSource}>
        <BankConnect accountId={accountId} hasReturn={hasReturn} />
      </Shell>
    )
  }

  // ── Upload ───────────────────────────────────────────────────────────────── //

  const rowCount = csvPreview?.rows.length ?? 0

  return (
    <Shell step={step} source={source} onSwitchSource={setSource}>
      <div className="flex flex-col gap-5">

        {/* Drop zone */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed
            px-6 py-12 text-center transition-colors
            ${isDragging
              ? 'border-neutral-400 bg-neutral-100 dark:border-neutral-500 dark:bg-neutral-800'
              : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-900'
            }
          `}
        >
          <span className="text-3xl">📄</span>
          {fileName ? (
            <>
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {fileName}
              </span>
              <span className="text-xs text-neutral-500">Click to change file</span>
            </>
          ) : (
            <>
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Drop a CSV file here, or click to browse
              </span>
              <span className="text-xs text-neutral-400">
                Accepts .csv exports from any bank (Sparkasse, DKB, N26, Revolut, …)
              </span>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onFileChange}
          className="hidden"
        />

        {parseError && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {parseError}
          </p>
        )}

        {/* Settings + preview — only shown after a file is loaded */}
        {rawText && (
          <>
            {/* Separator + skip rows */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Separator
                </span>
                <select
                  value={separator}
                  onChange={e => setSeparator(e.target.value as ';' | ',' | '\t')}
                  className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value=";">Semicolon (;)</option>
                  <option value=",">Comma (,)</option>
                  <option value={'\t'}>Tab</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Header on row
                  <span className="ml-1 font-normal text-neutral-400">(1 = first row)</span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={skipRows + 1}
                  onChange={e => setSkipRows(Math.max(0, (parseInt(e.target.value) || 1) - 1))}
                  className="rounded border border-neutral-200 px-3 py-2 text-sm tabular-nums dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
            </div>

            {/* File summary */}
            <p className="text-sm text-neutral-500">
              Separator: <strong className="text-neutral-700 dark:text-neutral-300">{sepLabel(separator)}</strong>
              {' · '}
              Header row: <strong className="text-neutral-700 dark:text-neutral-300">{skipRows + 1}</strong>
              {csvPreview && (
                <> · <strong className="text-neutral-700 dark:text-neutral-300">{rowCount}</strong> data row{rowCount !== 1 ? 's' : ''}</>
              )}
            </p>

            {/* Bank detection banner */}
            {detectedBank && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-950">
                <div className="text-sm">
                  <span className="font-semibold text-green-800 dark:text-green-200">
                    {detectedBank.name} detected
                  </span>
                  <span className="ml-2 text-green-700 dark:text-green-400">
                    — {bankRowCount} transactions ready, no column mapping needed
                  </span>
                </div>
                <button
                  onClick={handleBankDetectContinue}
                  className="shrink-0 rounded bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-500"
                >
                  Review →
                </button>
              </div>
            )}

            {/* Raw preview table */}
            {csvPreview && csvPreview.headers.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Preview (first 3 rows)
                </p>
                <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-neutral-900">
                      <tr>
                        {csvPreview.headers.map((h, colIdx) => (
                          <Th key={colIdx}>{h || '(empty)'}</Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {csvPreview.rows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {csvPreview.headers.map((h, colIdx) => (
                            <Td key={colIdx}>{row[h] ?? ''}</Td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleUploadContinue}
                disabled={rowCount === 0}
                className="rounded bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                Continue →
              </button>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────── //

/** Page shell with back-link, title, source tabs, and step indicator. */
function Shell({
  children, step, source, onSwitchSource,
}: {
  children:        React.ReactNode
  step:            Step
  source:          'csv' | 'bank'
  onSwitchSource:  (s: 'csv' | 'bank') => void
}) {
  const stepNum  = step === 'upload' ? 1 : step === 'map' ? 2 : step === 'review' ? 3 : 3
  const stepDone = step === 'done'

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header row */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/transactions"
            className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            aria-label="Back to transactions"
          >
            ←
          </Link>
          <h1 className="text-xl font-semibold">Import</h1>
        </div>
        {source === 'csv' && !stepDone && (
          <span className="text-sm text-neutral-400">Step {stepNum} of 3</span>
        )}
      </div>

      {/* Source tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-neutral-200 p-1 w-fit dark:border-neutral-700">
        {(['csv', 'bank'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onSwitchSource(s)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              source === s
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            {s === 'csv' ? 'CSV file' : 'Connect bank'}
          </button>
        ))}
      </div>

      {children}
    </div>
  )
}

/** Column selector dropdown. */
function ColSelect({
  label,
  value,
  onChange,
  headers,
  required,
  includeNone,
}: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  headers:     string[]
  required?:   boolean
  includeNone?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}{required && <span className="ml-1 text-red-500">*</span>}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {(includeNone || !required) && <option value="">— none —</option>}
        {headers.map((h, colIdx) => (
          <option key={colIdx} value={h}>{h}</option>
        ))}
      </select>
    </label>
  )
}

/** Status chip. */
function Chip({
  children,
  color,
}: {
  children: React.ReactNode
  color: 'neutral' | 'green' | 'yellow' | 'red'
}) {
  const cls = {
    neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    green:   'bg-green-100  text-green-800  dark:bg-green-900  dark:text-green-200',
    yellow:  'bg-amber-100  text-amber-800  dark:bg-amber-900  dark:text-amber-200',
    red:     'bg-red-100    text-red-800    dark:bg-red-900    dark:text-red-200',
  }[color]
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-medium ${cls}`}>
      {children}
    </span>
  )
}

/** Table header cell. */
function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 text-${align}`}>
      {children}
    </th>
  )
}

/** Table data cell. */
function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className={`max-w-[220px] truncate px-3 py-2 text-sm text-${align}`}>
      {children}
    </td>
  )
}
