'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { dbClient } from '@/db/db.client'
import type { SubscriptionRow } from '@/db/types'
import { suggestedAmountRange } from '@/lib/subscriptionMatcher'

interface Props {
  transactionId:    string
  description:      string
  amountCents:      number
  initialSubId:     string | null
  /** Disable mutations for read-only members. */
  canEdit:          boolean
}

/**
 * Lets the user pick a subscription for this transaction.  When a pick
 * happens, we offer a one-click "create a match pattern from this row"
 * shortcut so future similar transactions auto-link.
 */
export function SubscriptionPicker({ transactionId, description, amountCents, initialSubId, canEdit }: Props) {
  const [subs,         setSubs]         = useState<SubscriptionRow[]>([])
  const [selected,     setSelected]     = useState<string | null>(initialSubId)
  const [loading,      setLoading]      = useState(true)
  const [busy,         setBusy]         = useState(false)
  const [feedback,     setFeedback]     = useState<string | null>(null)
  const [showSuggest,  setShowSuggest]  = useState(false)
  const [patternDesc,  setPatternDesc]  = useState('')

  useEffect(() => {
    dbClient.subscriptions.list().then((rows) => {
      setSubs(rows.filter((s) => !s.cancelled_on))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function pick(value: string) {
    if (!canEdit) return
    const next = value || null
    setSelected(next)
    setBusy(true)
    setFeedback(null)
    try {
      await dbClient.subscriptions.linkTransaction(transactionId, next)
      if (next && next !== initialSubId) {
        setShowSuggest(true)
        setPatternDesc(description.slice(0, 30))
      }
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function createPattern() {
    if (!selected) return
    setBusy(true)
    setFeedback(null)
    try {
      const range = suggestedAmountRange(amountCents)
      await dbClient.subscriptions.insertPattern({
        subscription_id:      selected,
        description_contains: patternDesc.trim() || description.slice(0, 30),
        amount_min_cents:     range.min,
        amount_max_cents:     range.max,
      })
      setFeedback('Pattern saved')
      setShowSuggest(false)
      setTimeout(() => setFeedback(null), 1800)
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">Subscription</h2>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <select
            value={selected ?? ''}
            onChange={(e) => pick(e.target.value)}
            disabled={!canEdit || loading || busy}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:border-ring disabled:opacity-60"
          >
            <option value="">— Not a subscription —</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {selected && (
            <Link
              href={`/subscriptions/${selected}`}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Open →
            </Link>
          )}
        </div>

        {showSuggest && selected && canEdit && (
          <div className="mt-3 rounded-lg bg-muted/40 p-3">
            <p className="text-xs font-medium text-foreground">
              Auto-link future similar transactions?
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Save a match pattern so the next time this description shows up at this amount, it links automatically.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={patternDesc}
                onChange={(e) => setPatternDesc(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:border-ring"
                placeholder="Description substring"
              />
              <button
                type="button"
                onClick={createPattern}
                disabled={busy}
                className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Save pattern
              </button>
              <button
                type="button"
                onClick={() => setShowSuggest(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {feedback && <p className="mt-2 text-xs text-muted-foreground">{feedback}</p>}
      </div>
    </section>
  )
}
