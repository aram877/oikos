'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getSupabase } from '@/db/supabase'
import { clearAccountCache } from '@/db/accountContext'
import { Separator } from '@/components/ui/separator'
import { relativeTime } from '@/lib/relativeTime'
import { dbClient } from '@/db/db.client'

interface Notification {
  id:         string
  type:       string
  title:      string
  body:       string | null
  data:       Record<string, string> | null
  read_at:    string | null
  created_at: string
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [open,    setOpen]    = useState(false)
  const [items,   setItems]   = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const ref      = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<Notification[]>([])
  itemsRef.current = items

  const unread = items.filter(n => !n.read_at).length

  // ── Initial fetch ────────────────────────────────────────────────────── //
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title, body, data, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(30)

      setItems((data as Notification[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Realtime: detect own removal from account ────────────────────────── //
  useEffect(() => {
    const supabase = getSupabase()

    const memberChannel = supabase
      .channel('member_guard')
      .on(
        'postgres_changes',
        {
          event:  'DELETE',
          schema: 'public',
          table:  'account_members',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          clearAccountCache()
          window.location.replace('/')
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(memberChannel) }
  }, [userId])

  // ── Realtime: sync notification changes ──────────────────────────────── //
  useEffect(() => {
    const supabase = getSupabase()

    const channel = supabase
      .channel('notifications_rt')
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems(prev => [payload.new as Notification, ...prev])
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems(prev =>
            prev.map(n => n.id === (payload.new as Notification).id ? payload.new as Notification : n),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'DELETE',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems(prev => prev.filter(n => n.id !== (payload.old as { id: string }).id))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // ── Close on outside click ───────────────────────────────────────────── //
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Auto-mark all as read when dropdown is opened ────────────────────── //
  useEffect(() => {
    if (!open) return
    const unreadItems = itemsRef.current.filter(n => !n.read_at)
    if (unreadItems.length === 0) return

    const now = new Date().toISOString()
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))

    createClient()
      .from('notifications')
      .update({ read_at: now })
      .in('id', unreadItems.map(n => n.id))
      .then(() => {})
  }, [open])

  // ── Dismiss (delete) a notification ──────────────────────────────────── //
  async function dismiss(id: string) {
    setItems(prev => prev.filter(n => n.id !== id))
    await createClient().from('notifications').delete().eq('id', id)
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path
            fillRule="evenodd"
            d="M10 2a6 6 0 0 0-6 6v2.586l-1.707 1.707A1 1 0 0 0 3 14h14a1 1 0 0 0 .707-1.707L16 10.586V8a6 6 0 0 0-6-6ZM8 16a2 2 0 1 0 4 0H8Z"
            clipRule="evenodd"
          />
        </svg>

        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-card shadow-md z-50">
          <div className="px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
          </div>
          <Separator />

          <ul className="max-h-96 overflow-y-auto">
            {loading && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Loading…
              </li>
            )}

            {!loading && items.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-muted-foreground/40">
                  <path fillRule="evenodd" d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
              </li>
            )}

            {items.map((n, i) => (
              <li key={n.id}>
                {i > 0 && <Separator />}
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium text-foreground ${!n.read_at ? 'font-semibold' : ''}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {relativeTime(n.created_at)}
                    </p>

                    {n.type === 'invitation' && n.data?.invite_token && (
                      <Link
                        href={`/invite/accept?token=${n.data.invite_token}`}
                        onClick={() => setOpen(false)}
                        className="mt-2 inline-block rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        View invitation
                      </Link>
                    )}

                    {n.type === 'message' && (
                      <Link
                        href={
                          n.data?.conversation_id === 'group'
                            ? '/messages/group'
                            : n.data?.conversation_id
                              ? `/messages/${n.data.conversation_id}`
                              : '/messages'
                        }
                        onClick={() => {
                          setOpen(false)
                          // Optimistically mark the conversation read; the
                          // DB trigger will also drop these notifications.
                          const convId = n.data?.conversation_id
                          if (convId) {
                            dbClient.messages.markRead(convId).catch(() => {})
                          }
                        }}
                        className="mt-2 inline-block rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        Open chat
                      </Link>
                    )}
                  </div>

                  {n.type !== 'invitation' && (
                    <button
                      onClick={() => dismiss(n.id)}
                      aria-label="Dismiss"
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
