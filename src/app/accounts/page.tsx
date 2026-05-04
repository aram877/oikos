'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useAccountBalance } from '@/hooks/useAccountBalance'
import { Card, CardContent } from '@/components/ui/card'
import { Money } from '@/lib/privacy'

export default function AccountsPage() {
  const { balance, status, error } = useAccountBalance()

  useEffect(() => { document.title = 'Balances | Oikos' }, [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      <div className="mb-6">
        <h1 className="text-xl font-semibold">Balances</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Computed from all recorded transactions.
        </p>
      </div>

      {status === 'loading' && (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {status === 'error' && (
        <p className="py-12 text-center text-sm text-red-500">{error}</p>
      )}

      {status === 'loaded' && balance && (
        <div className="space-y-4">

          {/* Balance cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4 px-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Checking</div>
                <Money
                  cents={balance.balance_cents}
                  className={`block text-2xl font-bold tabular-nums ${balance.balance_cents >= 0 ? 'text-foreground' : 'text-red-600 dark:text-red-400'}`}
                />
                <p className="mt-1 text-xs text-muted-foreground">Sum of all transactions</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4 px-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Savings (est.)</div>
                <Money
                  cents={-balance.transfers_cents}
                  className="block text-2xl font-bold tabular-nums text-foreground"
                />
                <p className="mt-1 text-xs text-muted-foreground">Net of internal transfers</p>
              </CardContent>
            </Card>

            <Card className="sm:col-span-1">
              <CardContent className="py-4 px-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Net worth</div>
                <Money
                  cents={balance.cashflow_cents}
                  className={`block text-2xl font-bold tabular-nums ${balance.cashflow_cents >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                />
                <p className="mt-1 text-xs text-muted-foreground">Checking + savings</p>
              </CardContent>
            </Card>
          </div>

          {/* How it's calculated */}
          <Card>
            <CardContent className="py-4 px-5 space-y-3">
              <h2 className="text-sm font-semibold">How this is calculated</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total income (all time)</span>
                  <Money
                    cents={Math.max(0, balance.cashflow_cents - Math.min(0, balance.cashflow_cents))}
                    className="tabular-nums text-green-700 dark:text-green-400"
                  />
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span className="text-muted-foreground">Checking balance</span>
                  <Money cents={balance.balance_cents} className="tabular-nums font-medium" />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net transferred to savings</span>
                  <Money cents={-balance.transfers_cents} className="tabular-nums font-medium" />
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Net worth</span>
                  <Money
                    cents={balance.cashflow_cents}
                    className={`tabular-nums ${balance.cashflow_cents >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                "Savings" is estimated from the net of all internal transfers — money you marked as moving to/from your savings account.
                This reflects what's been tracked in Oikos and may not match your actual bank balance if not all transactions are recorded.
              </p>
            </CardContent>
          </Card>

          <div className="text-center">
            <Link href="/yearly" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Back to yearly overview
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
