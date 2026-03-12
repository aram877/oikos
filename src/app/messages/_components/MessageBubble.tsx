'use client'

import type { MessageRow } from '@/db/types'
import type { MemberInfo } from '@/hooks/useMemberNames'
import { relativeTime } from '@/lib/relativeTime'

interface Props {
  message:   MessageRow
  isOwn:     boolean
  member:    MemberInfo | undefined
}

export function MessageBubble({ message, isOwn, member }: Props) {
  const name      = member?.name ?? 'Unknown'
  const avatarUrl = member?.avatar_url ?? null
  const initial   = name.charAt(0).toUpperCase()
  const isOptimistic = message.id.startsWith('optimistic-')

  const avatar = (
    <div className="shrink-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initial}
        </div>
      )}
    </div>
  )

  if (isOwn) {
    return (
      <div className={`flex justify-end gap-2 ${isOptimistic ? 'opacity-60' : ''}`}>
        <div className="max-w-[75%]">
          <div className="rounded-tl-xl rounded-bl-xl rounded-tr-xl bg-primary px-3 py-2 text-sm text-primary-foreground break-words">
            {message.body}
          </div>
          <p className="mt-1 text-right text-[10px] text-muted-foreground">
            {isOptimistic ? 'Sending…' : relativeTime(message.created_at)}
          </p>
        </div>
        {avatar}
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      {avatar}
      <div className="max-w-[75%]">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{name}</p>
        <div className="rounded-tr-xl rounded-br-xl rounded-tl-xl border border-border bg-card px-3 py-2 text-sm break-words">
          {message.body}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {relativeTime(message.created_at)}
        </p>
      </div>
    </div>
  )
}
