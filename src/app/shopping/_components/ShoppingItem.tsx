'use client'

import { useState } from 'react'
import type { ShoppingItemRow } from '@/db/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
  item:         ShoppingItemRow
  onRemove:     (id: string) => void
  creatorName:  string | null
}

export function ShoppingItem({ item, onRemove, creatorName }: Props) {
  const [checked, setChecked] = useState(false)

  return (
    <li className="flex items-start gap-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => setChecked((v) => !v)}
        className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-neutral-800 dark:accent-neutral-200"
        aria-label={`Check off ${item.name}`}
      />
      <span className="min-w-0 flex-1">
        <span className={`text-sm${checked ? ' line-through opacity-60' : ''}`}>{item.name}</span>
        {(creatorName || item.created_at) && (
          <span className="mt-0.5 block text-xs text-neutral-400">
            Added{creatorName ? ` by ${creatorName}` : ''}{item.created_at ? ` · ${formatDate(item.created_at)}` : ''}
          </span>
        )}
      </span>
      {item.quantity && (
        <span className="mt-0.5 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {item.quantity}
        </span>
      )}
      <button
        onClick={() => onRemove(item.id)}
        className="shrink-0 p-1 text-neutral-300 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-300"
        aria-label={`Remove ${item.name}`}
      >
        ✕
      </button>
    </li>
  )
}
