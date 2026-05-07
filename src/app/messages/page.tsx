'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useConversationList } from './_hooks/useConversationList'
import { ConversationRow }    from './_components/ConversationRow'

export default function MessagesPage() {
  useEffect(() => { document.title = 'Messages | Oikos' }, [])

  const { items, loading } = useConversationList()
  const totalUnread = items.reduce((acc, i) => acc + i.unreadCount, 0)

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 3.5rem)' }}>
      <div className="sticky top-14 z-10 flex shrink-0 items-baseline justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold">Messages</h1>
          {totalUnread > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {totalUnread} unread
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <ul className="divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted/70" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.kind === 'group' ? '/messages/group' : `/messages/${item.id}`}
                className="block transition-colors hover:bg-muted/40 active:bg-muted"
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
