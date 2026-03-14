'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useMessages }      from '../_hooks/useMessages'
import { MessageList }      from '../_components/MessageList'
import { MessageInput }     from '../_components/MessageInput'
import { useMemberProfiles } from '@/hooks/useMemberNames'

export default function GroupChatPage() {
  useEffect(() => { document.title = 'Group Chat | Oikos' }, [])

  const { messages, status, error, rtStatus, currentUserId, send, reconnect } = useMessages('group')
  const { profiles } = useMemberProfiles()

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 3.5rem)' }}>

      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-3">
        <Link
          href="/messages"
          aria-label="Back to messages"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
        </Link>

        <h1 className="flex-1 text-base font-semibold">Group Chat</h1>

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

      {/* Loading / error states */}
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

      {/* Message list */}
      {status === 'loaded' && (
        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          profiles={profiles}
        />
      )}

      {/* Input */}
      <MessageInput onSend={send} />
    </div>
  )
}
