'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getSupabase } from '@/db/supabase'
import { clearAccountCache } from '@/db/accountContext'

interface Notification {
  id:         string
  type:       string
  title:      string
  body:       string | null
  data:       Record<string, string> | null
  read_at:    string | null
  created_at: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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
        className="relative flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 transition-colors"
      >
        {/* Bell SVG */}
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

        {/* Unread badge */}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900 z-50">
          <div className="border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800">
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Notifications
            </span>
          </div>

          <ul className="max-h-96 overflow-y-auto">
            {loading && (
              <li className="px-4 py-6 text-center text-sm text-neutral-400">
                Loading…
              </li>
            )}

            {!loading && items.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-neutral-400">
                No notifications
              </li>
            )}

            {items.map(n => (
              <li
                key={n.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-neutral-100 last:border-0 dark:border-neutral-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-neutral-400">
                    {relativeTime(n.created_at)}
                  </p>

                  {/* Invitation action */}
                  {n.type === 'invitation' && n.data?.invite_token && (
                    <Link
                      href={`/invite/accept?token=${n.data.invite_token}`}
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-block rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                    >
                      View invitation
                    </Link>
                  )}
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => dismiss(n.id)}
                  aria-label="Dismiss"
                  className="shrink-0 text-neutral-300 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
