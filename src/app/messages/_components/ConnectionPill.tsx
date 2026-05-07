'use client'

import type { RealtimeStatus } from '../_hooks/useMessages'

interface Props {
  status:   RealtimeStatus
  onRetry?: () => void
}

/**
 * Subtle realtime indicator.  Hidden when 'connected' (the happy path is
 * meant to be invisible — premium chat apps don't shout "Live!").
 */
export function ConnectionPill({ status, onRetry }: Props) {
  if (status === 'connected') return null

  if (status === 'error') {
    return (
      <button
        onClick={onRetry}
        title="Click to retry connection"
        className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
        Reconnect
      </button>
    )
  }

  return (
    <span
      title="Connecting…"
      className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
      Connecting
    </span>
  )
}
