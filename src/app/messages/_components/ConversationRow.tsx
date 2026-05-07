import type { ConversationItem } from '../_hooks/useConversationList'
import { Avatar, GroupAvatar } from './Avatar'

interface Props {
  item: ConversationItem
}

export function ConversationRow({ item }: Props) {
  const { label, avatarUrl, lastMessage, lastTime, unreadCount, isOwnLast, kind, partnerId } = item
  const unread = unreadCount > 0

  const previewPrefix = lastMessage
    ? (isOwnLast ? 'You: ' : '')
    : ''

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="relative shrink-0">
        {kind === 'group'
          ? <GroupAvatar size={48} />
          : <Avatar userId={partnerId ?? label} name={label} avatarUrl={avatarUrl} size={48} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[15px] ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
            {label}
          </span>
          {lastTime && (
            <span className={`shrink-0 text-xs ${unread ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
              {lastTime}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>
            {lastMessage
              ? <><span className="text-muted-foreground">{previewPrefix}</span>{lastMessage.body}</>
              : <span className="italic">No messages yet</span>}
          </p>
          {unread && (
            <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
