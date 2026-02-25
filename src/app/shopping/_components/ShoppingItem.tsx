'use client'

import { useState } from 'react'
import type { ShoppingItemRow } from '@/db/types'

interface Props {
  item:      ShoppingItemRow
  onCheck:   (id: string) => void
  onRemove:  (id: string) => void
}

export function ShoppingItem({ item, onCheck, onRemove }: Props) {
  const [fading, setFading] = useState(false)

  function handleCheck() {
    setFading(true)
    setTimeout(() => onCheck(item.id), 250)
  }

  return (
    <li
      className="flex items-center gap-3 py-3 transition-opacity duration-200"
      style={{ opacity: fading ? 0 : 1 }}
    >
      <input
        type="checkbox"
        onChange={handleCheck}
        className="h-4 w-4 cursor-pointer rounded accent-neutral-800 dark:accent-neutral-200"
        aria-label={`Check off ${item.name}`}
      />
      <span className="min-w-0 flex-1 text-sm">{item.name}</span>
      {item.quantity && (
        <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
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
