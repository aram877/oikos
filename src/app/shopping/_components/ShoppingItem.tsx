'use client'

import { useState } from 'react'
import type { ShoppingItemRow } from '@/db/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
  item:        ShoppingItemRow
  onToggle:    (id: string, done: boolean) => void
  onRemove:    (id: string) => void
  creatorName: string | null
  doneByName:  string | null
}

export function ShoppingItem({ item, onToggle, onRemove, creatorName, doneByName }: Props) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const checked = item.done_at !== null

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Checkbox
        id={`item-${item.id}`}
        checked={checked}
        onCheckedChange={(v) => onToggle(item.id, !!v)}
        aria-label={checked ? `Uncheck ${item.name}` : `Check off ${item.name}`}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <label
          htmlFor={`item-${item.id}`}
          className={`cursor-pointer text-sm transition-all duration-150 ${
            checked ? 'text-muted-foreground line-through opacity-60' : 'text-foreground'
          }`}
        >
          {item.name}
        </label>
        {checked ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Got it{doneByName ? ` · ${doneByName}` : ''}
          </span>
        ) : (creatorName || item.created_at) ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Added{creatorName ? ` by ${creatorName}` : ''}{item.created_at ? ` · ${formatDate(item.created_at)}` : ''}
          </span>
        ) : null}
      </span>

      {item.quantity && (
        <Badge variant="outline" className="mt-0.5 shrink-0 text-xs">
          {item.quantity}
        </Badge>
      )}

      {confirmRemove ? (
        <span className="mt-0.5 flex shrink-0 items-center gap-1.5 text-xs">
          <button
            onClick={() => onRemove(item.id)}
            className="font-medium text-destructive transition-colors hover:text-destructive/80"
          >
            Remove
          </button>
          <button
            onClick={() => setConfirmRemove(false)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirmRemove(true)}
          className="relative mt-0.5 shrink-0 p-1 text-muted-foreground transition-colors hover:text-foreground after:absolute after:-inset-3"
          aria-label={`Remove ${item.name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </li>
  )
}
