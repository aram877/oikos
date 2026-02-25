'use client'

import { useShoppingList } from './_hooks/useShoppingList'
import { AddItemForm }     from './_components/AddItemForm'
import { ShoppingItem }   from './_components/ShoppingItem'
import { useMemberNames } from '@/hooks/useMemberNames'

export default function ShoppingPage() {
  const { items, status, error, rtStatus, addItem, removeItem } = useShoppingList()
  const memberNames = useMemberNames()

  return (
    <div className="mx-auto max-w-xl px-4 py-6">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shopping List</h1>
        <span
          className="flex items-center gap-1.5 text-xs text-neutral-400"
          title={rtStatus === 'connected' ? 'Live sync active' : rtStatus === 'error' ? 'Sync error' : 'Connecting…'}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              rtStatus === 'connected'
                ? 'bg-green-500'
                : rtStatus === 'error'
                ? 'bg-red-400'
                : 'bg-yellow-400'
            }`}
          />
          {rtStatus === 'connected' ? 'Live' : rtStatus === 'error' ? 'Sync error' : 'Connecting'}
        </span>
      </div>

      {/* Add form */}
      <AddItemForm onAdd={addItem} />

      {/* Loading */}
      {status === 'loading' && (
        <p className="py-8 text-center text-sm text-neutral-400">Loading…</p>
      )}

      {/* Error */}
      {status === 'error' && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error ?? 'Failed to load shopping list.'}
        </p>
      )}

      {/* Empty state */}
      {status === 'loaded' && items.length === 0 && (
        <p className="py-16 text-center text-sm text-neutral-400">
          List is empty — add your first item above
        </p>
      )}

      {/* List */}
      {status === 'loaded' && items.length > 0 && (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {items.map((item) => (
            <ShoppingItem
              key={item.id}
              item={item}
              onRemove={removeItem}
              creatorName={memberNames[item.added_by ?? ''] ?? null}
            />
          ))}
        </ul>
      )}

    </div>
  )
}
