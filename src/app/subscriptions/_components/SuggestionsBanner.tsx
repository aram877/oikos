'use client'

import Link from 'next/link'
import type { SubscriptionSuggestion } from '@/lib/subscriptionDetector'

interface Props {
  count:    number
  examples: SubscriptionSuggestion[]   // first 2-3, for the preview line
}

export function SuggestionsBanner({ count, examples }: Props) {
  if (count === 0) return null

  const previewNames = examples.slice(0, 3).map((s) => s.suggestedName)
  const tail = count > previewNames.length ? `, and ${count - previewNames.length} more` : ''
  const preview = previewNames.length > 0 ? `${previewNames.join(', ')}${tail}` : ''

  return (
    <Link
      href="/subscriptions/discover"
      className="mb-5 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 transition-colors hover:bg-primary/10"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
        <SparkleIcon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {count} likely subscription{count === 1 ? '' : 's'} detected
        </p>
        {preview && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{preview}</p>
        )}
      </div>
      <span className="shrink-0 self-center text-xs font-medium text-primary">Review →</span>
    </Link>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576L2.044 12.72a.75.75 0 0 1 0-1.442l2.846-.813a3.75 3.75 0 0 0 2.576-2.576l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036a2.625 2.625 0 0 0 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258a2.625 2.625 0 0 0-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z" clipRule="evenodd" />
    </svg>
  )
}
