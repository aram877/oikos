'use client'

import type { MessageRow } from '@/db/types'
import type { MemberInfo } from '@/hooks/useMemberNames'
import { bubbleTime, fullTimestamp } from '@/lib/messageTime'
import { Avatar } from './Avatar'

export type GroupPosition = 'single' | 'first' | 'middle' | 'last'

interface Props {
  message:     MessageRow
  isOwn:       boolean
  member:      MemberInfo | undefined
  /** Position in a same-sender run; controls bubble corners + avatar slot. */
  position:    GroupPosition
  /** Show the sender label above the bubble (group chats, first of a run). */
  showName:    boolean
  /** Show the inline time below the last bubble in a run. */
  showTime:    boolean
  /** Read-receipt slot for own last message ("Sent" | "Read" | null). */
  receipt?:    React.ReactNode
}

function bubbleCornerClasses(isOwn: boolean, pos: GroupPosition): string {
  // iMessage-style: tail corner stays sharp, the rest rounded.  Within a run,
  // the side facing the previous/next bubble in the run gets tightened.
  if (isOwn) {
    if (pos === 'single') return 'rounded-2xl rounded-br-md'
    if (pos === 'first')  return 'rounded-2xl rounded-br-md'
    if (pos === 'middle') return 'rounded-2xl rounded-tr-md rounded-br-md'
    return 'rounded-2xl rounded-tr-md'
  }
  if (pos === 'single') return 'rounded-2xl rounded-bl-md'
  if (pos === 'first')  return 'rounded-2xl rounded-bl-md'
  if (pos === 'middle') return 'rounded-2xl rounded-tl-md rounded-bl-md'
  return 'rounded-2xl rounded-tl-md'
}

export function MessageBubble({
  message, isOwn, member, position, showName, showTime, receipt,
}: Props) {
  const name      = member?.name ?? 'Unknown'
  const avatarUrl = member?.avatar_url ?? null
  const isOptimistic = message.id.startsWith('optimistic-')

  const showAvatar = position === 'single' || position === 'last'
  const tightTop   = position === 'middle' || position === 'last'

  const bubbleClass = `${bubbleCornerClasses(isOwn, position)} px-3.5 py-2 text-[15px] leading-snug break-words shadow-[0_1px_1px_rgba(0,0,0,0.04)] ${
    isOwn
      ? 'bg-primary text-primary-foreground'
      : 'bg-card border border-border text-foreground'
  }`

  if (isOwn) {
    return (
      <div className={`flex justify-end ${tightTop ? 'mt-0.5' : 'mt-2'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
        <div className="flex max-w-[78%] flex-col items-end">
          <div
            title={fullTimestamp(message.created_at)}
            className={`${bubbleClass} ${isOptimistic ? 'opacity-70' : ''}`}
          >
            {message.body}
          </div>
          {(showTime || receipt) && (
            <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
              {showTime && (
                <span>{isOptimistic ? 'Sending…' : bubbleTime(message.created_at)}</span>
              )}
              {receipt}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-end gap-2 ${tightTop ? 'mt-0.5' : 'mt-2'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
      <div className="w-8 shrink-0">
        {showAvatar && (
          <Avatar userId={message.user_id} name={name} avatarUrl={avatarUrl} size={28} />
        )}
      </div>
      <div className="flex max-w-[78%] flex-col items-start">
        {showName && (
          <p className="mb-0.5 ml-1 text-[11px] font-medium text-muted-foreground">{name}</p>
        )}
        <div
          title={fullTimestamp(message.created_at)}
          className={bubbleClass}
        >
          {message.body}
        </div>
        {showTime && (
          <p className="mt-1 ml-1 text-[11px] text-muted-foreground">
            {bubbleTime(message.created_at)}
          </p>
        )}
      </div>
    </div>
  )
}
