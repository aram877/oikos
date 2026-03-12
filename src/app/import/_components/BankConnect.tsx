'use client'

/**
 * BankConnect — GoCardless Open Banking import flow.
 *
 * Steps:
 *  1. Country select
 *  2. Institution select (fetched from GoCardless)
 *  3. [redirect to bank for auth]
 *  4. Account select (on return from bank)
 *  5. Transaction review + import
 */

import { useCallback, useEffect, useState } from 'react'
import { dbClient } from '@/db/db.client'
import type { GCInstitution } from '@/app/api/gocardless/institutions/route'
import type { GCAccount }     from '@/app/api/gocardless/accounts/route'
import type { InsertTransactionInput } from '@/db/types'

// ── Session storage key ───────────────────────────────────────────────────── //

const SESSION_KEY = 'gc_requisition_id'

// ── EU country list ───────────────────────────────────────────────────────── //

const EU_COUNTRIES: { code: string; name: string }[] = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'NO', name: 'Norway' },
]

// ── Types ─────────────────────────────────────────────────────────────────── //

type Phase =
  | 'country'
  | 'institutions'
  | 'connecting'
  | 'accounts'
  | 'transactions'
  | 'review'
  | 'done'

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
function formatEur(cents: number) { return eurFmt.format(cents / 100) }

// ── Component ─────────────────────────────────────────────────────────────── //

interface Props {
  /** The household account to import transactions into */
  accountId: string
  /** If GoCardless redirected back with a pending requisition stored in sessionStorage */
  hasReturn: boolean
}

export function BankConnect({ accountId, hasReturn }: Props) {
  const [phase,        setPhase]        = useState<Phase>(hasReturn ? 'accounts' : 'country')
  const [country,      setCountry]      = useState('')
  const [institutions, setInstitutions] = useState<GCInstitution[]>([])
  const [instSearch,   setInstSearch]   = useState('')
  const [accounts,     setAccounts]     = useState<GCAccount[]>([])
  const [gcAccountId,  setGcAccountId]  = useState('')
  const [transactions, setTransactions] = useState<InsertTransactionInput[]>([])
  const [dupHashes,    setDupHashes]    = useState<Set<string>>(new Set())
  const [dateFrom,     setDateFrom]     = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    return d.toISOString().slice(0, 10)
  })

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [imported, setImported] = useState(0)

  // ── Step 4: Auto-fetch accounts on return from bank ─────────────────────── //

  useEffect(() => {
    if (!hasReturn) return
    const reqId = sessionStorage.getItem(SESSION_KEY)
    if (!reqId) {
      setError('Session expired — please start the connection again.')
      setPhase('country')
      return
    }
    fetchAccounts(reqId)
  }, [hasReturn])

  // ── Fetch institutions for selected country ─────────────────────────────── //

  async function handleCountrySelect(code: string) {
    setCountry(code)
    setPhase('institutions')
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/gocardless/institutions?country=${code}`)
      const data = await res.json() as { institutions?: GCInstitution[]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to load institutions')
      setInstitutions(data.institutions ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ── Create requisition + redirect to bank ─────────────────────────────────  //

  async function handleInstitutionSelect(inst: GCInstitution) {
    setPhase('connecting')
    setError(null)
    try {
      const res  = await fetch('/api/gocardless/connect', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ institution_id: inst.id }),
      })
      const data = await res.json() as { requisition_id?: string; link?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to connect')

      // Store requisition ID in sessionStorage before redirecting
      sessionStorage.setItem(SESSION_KEY, data.requisition_id!)
      window.location.href = data.link!
    } catch (err) {
      setError((err as Error).message)
      setPhase('institutions')
    }
  }

  // ── Fetch accounts for the completed requisition ────────────────────────── //

  const fetchAccounts = useCallback(async (reqId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/gocardless/accounts?requisition_id=${reqId}`)
      const data = await res.json() as { accounts?: GCAccount[]; status?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to load accounts')

      if (!data.accounts || data.accounts.length === 0) {
        throw new Error(
          data.status === 'CR'
            ? 'Bank authorisation is still pending — please complete the process in your bank and return here.'
            : 'No accounts found. The authorisation may have expired — please try again.'
        )
      }

      setAccounts(data.accounts)
      setGcAccountId(data.accounts[0].id)
      setPhase('accounts')
    } catch (err) {
      setError((err as Error).message)
      setPhase('country')
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Fetch transactions ──────────────────────────────────────────────────── //

  async function handleFetchTransactions() {
    if (!gcAccountId || !accountId) return
    setLoading(true)
    setError(null)
    setPhase('transactions')
    try {
      const res = await fetch(
        `/api/gocardless/transactions?gc_account_id=${gcAccountId}&account_id=${accountId}&date_from=${dateFrom}`
      )
      const data = await res.json() as { transactions?: InsertTransactionInput[]; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to fetch transactions')

      const txns = data.transactions ?? []
      setTransactions(txns)

      // Check duplicates
      const hashes   = txns.map((t) => t.import_hash ?? '')
      const existing = await dbClient.transactions.checkImportHashes(hashes)
      setDupHashes(new Set(existing))
      setPhase('review')
    } catch (err) {
      setError((err as Error).message)
      setPhase('accounts')
    } finally {
      setLoading(false)
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────── //

  async function handleImport() {
    const newTxns = transactions.filter((t) => !dupHashes.has(t.import_hash ?? ''))
    setLoading(true)
    setError(null)
    try {
      const count = await dbClient.transactions.insertBulk(newTxns)
      sessionStorage.removeItem(SESSION_KEY)
      setImported(count)
      setPhase('done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────── //

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <span className="text-2xl">✓</span>
        </div>
        <p className="text-base font-medium">
          {imported} transaction{imported !== 1 ? 's' : ''} imported from your bank
        </p>
        <button
          onClick={() => { setPhase('country'); setTransactions([]); setAccounts([]) }}
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
        >
          Connect another account
        </button>
      </div>
    )
  }

  if (phase === 'connecting') {
    return (
      <div className="py-16 text-center text-sm text-neutral-400">
        Redirecting to your bank…
      </div>
    )
  }

  if (phase === 'transactions') {
    return (
      <div className="py-16 text-center text-sm text-neutral-400">
        Fetching transactions…
      </div>
    )
  }

  const filteredInst = institutions.filter((i) =>
    i.name.toLowerCase().includes(instSearch.toLowerCase())
  )

  const newTxns  = transactions.filter((t) => !dupHashes.has(t.import_hash ?? ''))
  const dupCount = transactions.length - newTxns.length

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* ── Step 1: Country ──────────────────────────────────────────────── */}
      {(phase === 'country' || phase === 'institutions') && (
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Select your country
          </label>
          <select
            value={country}
            onChange={(e) => e.target.value && handleCountrySelect(e.target.value)}
            className="w-full rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">— pick a country —</option>
            {EU_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Step 2: Institution list ─────────────────────────────────────── */}
      {phase === 'institutions' && (
        <div>
          {loading ? (
            <p className="py-6 text-center text-sm text-neutral-400">Loading banks…</p>
          ) : institutions.length === 0 ? (
            <p className="text-sm text-neutral-400">No banks found for this country.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Select your bank
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    ({institutions.length} available)
                  </span>
                </p>
              </div>

              <input
                type="text"
                placeholder="Search…"
                value={instSearch}
                onChange={(e) => setInstSearch(e.target.value)}
                className="mb-3 w-full rounded border border-neutral-200 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />

              <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-100 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700">
                {filteredInst.map((inst) => (
                  <li key={inst.id}>
                    <button
                      onClick={() => handleInstitutionSelect(inst)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      {inst.logo && (
                        <img src={inst.logo} alt="" className="h-6 w-6 rounded object-contain" />
                      )}
                      <span className="flex-1 truncate">{inst.name}</span>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {inst.transaction_total_days}d history
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ── Step 4: Account select ───────────────────────────────────────── */}
      {phase === 'accounts' && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <p className="py-6 text-center text-sm text-neutral-400">Loading accounts…</p>
          ) : (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Bank authorised — select account to import from
                </label>
                <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700">
                  {accounts.map((acc) => (
                    <li key={acc.id}>
                      <button
                        onClick={() => setGcAccountId(acc.id)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                          gcAccountId === acc.id
                            ? 'bg-neutral-50 dark:bg-neutral-800'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <span className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 ${
                          gcAccountId === acc.id
                            ? 'border-neutral-900 bg-neutral-900 dark:border-neutral-100 dark:bg-neutral-100'
                            : 'border-neutral-300 dark:border-neutral-600'
                        }`} />
                        <div>
                          <p className="text-sm font-medium">{acc.name ?? 'Account'}</p>
                          {acc.iban && (
                            <p className="text-xs text-neutral-400 font-mono">{acc.iban}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Import transactions from
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
                <p className="mt-1 text-xs text-neutral-400">
                  GoCardless free tier provides up to 90 days of history.
                </p>
              </div>

              <button
                onClick={handleFetchTransactions}
                disabled={!gcAccountId}
                className="self-start rounded bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                Fetch transactions →
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Step 5: Review + import ──────────────────────────────────────── */}
      {phase === 'review' && (
        <div className="flex flex-col gap-4">
          {/* Summary chips */}
          <div className="flex flex-wrap gap-3 text-sm">
            <Chip color="neutral">{transactions.length} transactions fetched</Chip>
            <Chip color="green">{newTxns.length} new</Chip>
            {dupCount > 0 && (
              <Chip color="yellow">{dupCount} already imported (skipped)</Chip>
            )}
          </div>

          {newTxns.length === 0 ? (
            <p className="text-sm text-neutral-500">
              All transactions are already imported. Nothing new to add.
            </p>
          ) : (
            <>
              {/* Preview table */}
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
                    {newTxns.slice(0, 30).map((t, i) => (
                      <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                        <Td>{t.date}</Td>
                        <Td>{t.description}</Td>
                        <Td align="right">
                          <span className={t.amount_cents < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'}>
                            {formatEur(t.amount_cents)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {newTxns.length > 30 && (
                  <p className="px-4 py-2 text-xs text-neutral-500">
                    … and {newTxns.length - 30} more
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="rounded bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                >
                  {loading ? 'Importing…' : `Import ${newTxns.length} transaction${newTxns.length !== 1 ? 's' : ''}`}
                </button>
                <button
                  onClick={() => setPhase('accounts')}
                  disabled={loading}
                  className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  ← Back
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────── //

function Chip({ children, color }: { children: React.ReactNode; color: 'neutral' | 'green' | 'yellow' }) {
  const cls = {
    neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    green:   'bg-green-100  text-green-800  dark:bg-green-900  dark:text-green-200',
    yellow:  'bg-amber-100  text-amber-800  dark:bg-amber-900  dark:text-amber-200',
  }[color]
  return <span className={`rounded-full px-3 py-1 text-sm font-medium ${cls}`}>{children}</span>
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 text-${align}`}>
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className={`max-w-[220px] truncate px-3 py-2 text-sm text-${align}`}>
      {children}
    </td>
  )
}
