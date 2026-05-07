'use client'

import { use, useEffect } from 'react'
import Link from 'next/link'
import { useMessages }       from '../_hooks/useMessages'
import { MessageList }       from '../_components/MessageList'
import { MessageInput }      from '../_components/MessageInput'
import { Avatar }            from '../_components/Avatar'
import { ConnectionPill }    from '../_components/ConnectionPill'
import { useMemberProfiles } from '@/hooks/useMemberNames'
import { isActiveNow, lastSeenLabel } from '@/lib/messageTime'

interface Props {
  params: Promise<{ userId: string }>
}

export default function DmPage({ params }: Props) {
  const { userId } = use(params)

  const { messages, status, error, rtStatus, currentUserId, partnerReadAt, send, reconnect }
    = useMessages(userId)
  const { profiles } = useMemberProfiles()

  const partnerName  = profiles[userId]?.name ?? 'Direct Message'
  const partnerAvatar = profiles[userId]?.avatar_url ?? null
  const online       = isActiveNow(partnerReadAt)
  const presence     = online ? 'Active now' : lastSeenLabel(partnerReadAt)

  useEffect(() => {
    document.title = `${partnerName} | Oikos`
  }, [partnerName])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 3.5rem)' }}>
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background/85 px-2 py-2.5 backdrop-blur sm:px-4">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </Link>

        <div className="relative shrink-0">
          <Avatar userId={userId} name={partnerName} avatarUrl={partnerAvatar} size={36} />
          {online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-tight">{partnerName}</h1>
          {presence && (
            <p className={`truncate text-xs ${online ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
              {presence}
            </p>
          )}
        </div>

        <ConnectionPill status={rtStatus} onRetry={reconnect} />
      </div>

      {status === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      )}
      {status === 'error' && (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? 'Failed to load messages.'}
          </p>
        </div>
      )}

      {status === 'loaded' && (
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          profiles={profiles}
          conversationId={userId}
          partnerReadAt={partnerReadAt}
        />
      )}

      <MessageInput onSend={send} />
    </div>
  )
}
