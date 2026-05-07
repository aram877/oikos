'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MessageRow } from '@/db/types'
import type { MemberInfo } from '@/hooks/useMemberNames'
import { MessageBubble, type GroupPosition } from './MessageBubble'
import { dayLabel } from '@/lib/messageTime'

const GROUP_GAP_MS = 4 * 60_000     // > 4 min between same-sender msgs splits the run

interface Props {
  messages:      MessageRow[]
  currentUserId: string | null
  profiles:      Record<string, MemberInfo>
  /** 'group' | partner_user_id */
  conversationId: 'group' | string
  /** DM partner's last_read_at (DM only). */
  partnerReadAt?: string | null
  /** Group: each member's last_read_at (excludes current user). */
  groupReads?:    Record<string, string>
}

interface DerivedRow {
  msg:        MessageRow
  isOwn:      boolean
  position:   GroupPosition
  showName:   boolean
  showTime:   boolean
  showDate:   boolean
  dayKey:     string
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function deriveRows(
  messages: MessageRow[],
  currentUserId: string | null,
  isGroup: boolean,
): DerivedRow[] {
  return messages.map((msg, i): DerivedRow => {
    const prev = messages[i - 1]
    const next = messages[i + 1]

    const isOwn = msg.user_id === currentUserId
    const showDate = !prev || !isSameDay(prev.created_at, msg.created_at)

    const sameSenderAsPrev = !!prev
      && prev.user_id === msg.user_id
      && isSameDay(prev.created_at, msg.created_at)
      && (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < GROUP_GAP_MS

    const sameSenderAsNext = !!next
      && next.user_id === msg.user_id
      && isSameDay(next.created_at, msg.created_at)
      && (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) < GROUP_GAP_MS

    let position: GroupPosition
    if (sameSenderAsPrev && sameSenderAsNext) position = 'middle'
    else if (sameSenderAsPrev)               position = 'last'
    else if (sameSenderAsNext)               position = 'first'
    else                                     position = 'single'

    return {
      msg,
      isOwn,
      position,
      showName: isGroup && !isOwn && !sameSenderAsPrev,
      showTime: !sameSenderAsNext,
      showDate,
      dayKey:   new Date(msg.created_at).toDateString(),
    }
  })
}

export function MessageList({
  messages, currentUserId, profiles, conversationId, partnerReadAt, groupReads,
}: Props) {
  const isGroup            = conversationId === 'group'
  const bottomRef          = useRef<HTMLDivElement>(null)
  const containerRef       = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const lastIdRef          = useRef<string | null>(null)

  const rows = useMemo(
    () => deriveRows(messages, currentUserId, isGroup),
    [messages, currentUserId, isGroup],
  )

  // Index of last own message — used for the read-receipt slot.
  const lastOwnIdx = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].isOwn) return i
    return -1
  }, [rows])

  // Auto-scroll on new messages.  Pure DOM work; "new message while scrolled
  // up" notification is owned by the scroll handler below.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const lastMsg  = messages[messages.length - 1]
    const lastId   = lastMsg?.id ?? null
    const isNewMsg = lastId !== lastIdRef.current
    lastIdRef.current = lastId

    if (!isNewMsg) return
    const distance  = el.scrollHeight - el.scrollTop - el.clientHeight
    const isOwnLast = lastMsg?.user_id === currentUserId
    if (isOwnLast || distance < 160) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, currentUserId])

  // First-paint scroll (no animation)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setShowScrollBtn(!isNearBottom)
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setShowScrollBtn(false)
  }

  // ── Read-receipt rendering ──────────────────────────────────────────────── //

  function ownReceipt(idx: number): React.ReactNode {
    if (idx !== lastOwnIdx) return null
    const msg = rows[idx].msg
    if (msg.id.startsWith('optimistic-')) return null

    const seenByOthers = isGroup
      ? Object.values(groupReads ?? {}).filter((ts) => ts >= msg.created_at).length
      : (partnerReadAt && partnerReadAt >= msg.created_at) ? 1 : 0

    if (seenByOthers > 0) {
      const label = isGroup
        ? (seenByOthers === Object.keys(groupReads ?? {}).length || seenByOthers > 1 ? `Read · ${seenByOthers}` : 'Read · 1')
        : 'Read'
      return (
        <span className="inline-flex items-center gap-1 text-primary" aria-label={label}>
          <DoubleCheck />
          <span>{label}</span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1" aria-label="Sent">
        <SingleCheck />
        <span>Sent</span>
      </span>
    )
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-3 py-4 sm:px-5"
      >
        {rows.length === 0 && <EmptyState />}

        <div className="mx-auto max-w-2xl">
          {rows.map((row, i) => (
            <div key={row.msg.id}>
              {row.showDate && (
                <div className="my-4 flex items-center justify-center">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {dayLabel(row.msg.created_at)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={row.msg}
                isOwn={row.isOwn}
                member={profiles[row.msg.user_id]}
                position={row.position}
                showName={row.showName}
                showTime={row.showTime}
                receipt={row.isOwn ? ownReceipt(i) : null}
              />
            </div>
          ))}
        </div>

        <div ref={bottomRef} />
      </div>

      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
          className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground/60">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
          <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground">No messages yet</p>
      <p className="text-xs text-muted-foreground">Say hello to get the conversation started.</p>
    </div>
  )
}

function SingleCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path fillRule="evenodd" d="M13.78 4.97a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0L2.97 9.28a.75.75 0 1 1 1.06-1.06l2.72 2.72 5.97-5.97a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
    </svg>
  )
}

function DoubleCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 12" fill="currentColor" className="h-3 w-4">
      <path d="M11.6.45a.75.75 0 0 1 0 1.06L5.6 7.5a.75.75 0 0 1-1.06 0L1.7 4.66a.75.75 0 1 1 1.06-1.06l2.31 2.3 5.47-5.45a.75.75 0 0 1 1.06 0Z" />
      <path d="M16.6.45a.75.75 0 0 1 0 1.06L10.6 7.5a.75.75 0 0 1-1.06 0l-.84-.84a.75.75 0 1 1 1.06-1.06l.31.31L15.54.45a.75.75 0 0 1 1.06 0Z" />
    </svg>
  )
}
