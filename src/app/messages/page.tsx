'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useConversationList } from './_hooks/useConversationList'
import { ConversationRow }    from './_components/ConversationRow'

export default function MessagesPage() {
  useEffect(() => { document.title = 'Messages | Oikos' }, [])

  const { items, loading } = useConversationList()

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 3.5rem)' }}>

      {/* Header */}
      <div className="flex shrink-0 items-center border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold">Messages</h1>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.kind === 'group' ? '/messages/group' : `/messages/${item.id}`}
                className="block transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <ConversationRow item={item} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
