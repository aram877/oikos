'use client'

import { useEffect } from 'react'
import { useMessages } from './_hooks/useMessages'
import { MessageList }  from './_components/MessageList'
import { MessageInput } from './_components/MessageInput'
import { useMemberProfiles } from '@/hooks/useMemberNames'

export default function MessagesPage() {
  useEffect(() => { document.title = 'Messages | Oikos' }, [])

  const { messages, status, error, rtStatus, currentUserId, send, reconnect } = useMessages()
  const { profiles } = useMemberProfiles()

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 3.5rem)' }}>

      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-base font-semibold">Messages</h1>
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
