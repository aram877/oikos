import type { ConversationItem } from '../_hooks/useConversationList'

interface ConversationRowProps {
  item: ConversationItem
}

export function ConversationRow({ item }: ConversationRowProps) {
  const { label, avatarUrl, lastMessage, lastTime, unread, kind } = item

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Avatar */}
      <div className="relative shrink-0">
        {kind === 'group' ? (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              <path d="M4 9.25a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0ZM4.75 15a3.25 3.25 0 0 0-3.25 3.25v.25A2.5 2.5 0 0 0 4 21h12a2.5 2.5 0 0 0 2.5-2.5v-.25A3.25 3.25 0 0 0 15.25 15H4.75ZM17.5 7.5a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5ZM19.75 15h-1a4.74 4.74 0 0 1 2 1.69V17a3 3 0 0 0-.75 2H22a2 2 0 0 0 2-2v-.25A2.75 2.75 0 0 0 21.25 14h-1.5Z" />
            </svg>
          </div>
        ) : avatarUrl ? (
          <img
            src={avatarUrl}
            alt={label}
            className="h-11 w-11 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {label.charAt(0).toUpperCase()}
          </div>
        )}
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${unread ? 'font-semibold' : 'font-medium'}`}>
            {label}
          </span>
          {lastTime && (
            <span className="shrink-0 text-xs text-muted-foreground">{lastTime}</span>
          )}
        </div>
        <p className={`truncate text-xs ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>
          {lastMessage ? lastMessage.body : 'No messages yet'}
        </p>
      </div>
    </div>
  )
}
