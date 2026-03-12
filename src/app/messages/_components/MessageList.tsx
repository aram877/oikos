'use client'

import { useEffect, useRef, useState } from 'react'
import type { MessageRow } from '@/db/types'
import type { MemberInfo } from '@/hooks/useMemberNames'
import { MessageBubble } from './MessageBubble'

interface Props {
  messages:      MessageRow[]
  currentUserId: string | null
  profiles:      Record<string, MemberInfo>
}

function formatDateLabel(iso: string): string {
  const date  = new Date(iso)
  const today = new Date()
  const diff  = Math.floor(
    (today.setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0)) / 86_400_000,
  )
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export function MessageList({ messages, currentUserId, profiles }: Props) {
  const bottomRef          = useRef<HTMLDivElement>(null)
  const containerRef       = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  // Auto-scroll to bottom on initial load and when user is at/near bottom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      setShowScrollBtn(true)
    }
  }, [messages])

  // Hide scroll button when user scrolls to bottom
  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setShowScrollBtn(!isNearBottom)
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowScrollBtn(false)
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-muted-foreground/30">
              <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-muted-foreground">No messages yet — say hello!</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg, i) => {
            const showDate = i === 0 || !isSameDay(messages[i - 1].created_at, msg.created_at)
            const isOwn    = msg.user_id === currentUserId

            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">
                      {formatDateLabel(msg.created_at)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  member={profiles[msg.user_id]}
                />
              </div>
            )
          })}
        </div>

        <div ref={bottomRef} />
      </div>

      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
          className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}
