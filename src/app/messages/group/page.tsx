'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useMessages }      from '../_hooks/useMessages'
import { MessageList }      from '../_components/MessageList'
import { MessageInput }     from '../_components/MessageInput'
import { GroupAvatar }      from '../_components/Avatar'
import { useMemberProfiles } from '@/hooks/useMemberNames'
import { ConnectionPill }   from '../_components/ConnectionPill'

export default function GroupChatPage() {
  useEffect(() => { document.title = 'Group Chat | Oikos' }, [])

  const { messages, status, error, rtStatus, currentUserId, groupReads, send, reconnect }
    = useMessages('group')
  const { profiles } = useMemberProfiles()

  const memberCount = Object.keys(profiles).length

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

        <GroupAvatar size={36} />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-tight">Group Chat</h1>
          <p className="truncate text-xs text-muted-foreground">
            {memberCount > 0 ? `${memberCount} member${memberCount === 1 ? '' : 's'}` : '—'}
          </p>
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
          conversationId="group"
          groupReads={groupReads}
        />
      )}

      <MessageInput onSend={send} />
    </div>
  )
}
