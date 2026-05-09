'use client'

import { useEffect } from 'react'
import { useShoppingList } from './_hooks/useShoppingList'
import { AddItemForm }     from './_components/AddItemForm'
import { ShoppingItem }   from './_components/ShoppingItem'
import { useMemberNames } from '@/hooks/useMemberNames'
import { Card, CardContent } from '@/components/ui/card'

export default function ShoppingPage() {
  useEffect(() => { document.title = 'Shopping | Oikos' }, [])

  const { items, status, error, rtStatus, addItem, toggleDone, removeItem, reconnect } = useShoppingList()
  const memberNames = useMemberNames()

  return (
    <div className="mx-auto max-w-xl px-4 py-6">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Shopping List</h1>
        {rtStatus === 'error' ? (
          <button
            onClick={reconnect}
            className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs text-red-800 transition-colors hover:bg-red-200 dark:bg-red-950 dark:text-red-400 dark:hover:bg-red-900"
            title="Click to retry connection"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
            Sync error — retry
          </button>
        ) : (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
              rtStatus === 'connected'
                ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
            title={rtStatus === 'connected' ? 'Live sync active' : 'Connecting…'}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                rtStatus === 'connected' ? 'bg-green-500' : 'bg-yellow-400'
              }`}
            />
            {rtStatus === 'connected' ? 'Live' : 'Connecting'}
          </span>
        )}
      </div>

      {/* Add form */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <AddItemForm onAdd={addItem} />
        </CardContent>
      </Card>

      {/* Loading */}
      {status === 'loading' && (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {/* Error */}
      {status === 'error' && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? 'Failed to load shopping list.'}
        </p>
      )}

      {/* Empty state */}
      {status === 'loaded' && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <span className="text-4xl" aria-hidden="true">🛒</span>
          <p className="text-sm text-muted-foreground">
            Your list is empty — add your first item above
          </p>
        </div>
      )}

      {/* List */}
      {status === 'loaded' && items.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <ShoppingItem
                  key={item.id}
                  item={item}
                  onToggle={toggleDone}
                  onRemove={removeItem}
                  creatorName={memberNames[item.added_by ?? ''] ?? null}
                  doneByName={memberNames[item.done_by ?? ''] ?? null}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
