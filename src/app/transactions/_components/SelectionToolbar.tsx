'use client'

import { useState, useEffect } from 'react'
import type { CategoryRow, SubscriptionRow } from '@/db/types'
import { dbClient } from '@/db/db.client'

interface Props {
  count:                 number
  busy:                  boolean
  error:                 string | null
  categories:            CategoryRow[]
  /** Disable the AI button when the user has no AI write access. */
  canAutoCategorize?:    boolean
  /** Inline progress label while auto-categorize is running. */
  autoCategorizeStatus?: 'idle' | 'running' | 'done'
  autoCategorizeIndex?:  number
  autoCategorizeTotal?:  number
  onCategorize:          (categoryId: string | null) => unknown | Promise<unknown>
  onAutoCategorize:      ()                          => unknown | Promise<unknown>
  onLinkSubscription:    (subId: string | null)      => unknown | Promise<unknown>
  onSetTransfer:         (isTransfer: boolean)        => unknown | Promise<unknown>
  onDelete:              ()                          => unknown | Promise<unknown>
  onClear:               ()                          => void
}

type Picker = 'category' | 'subscription' | null

export function SelectionToolbar(props: Props) {
  const {
    count, busy, error, categories, canAutoCategorize = true,
    autoCategorizeStatus = 'idle', autoCategorizeIndex = 0, autoCategorizeTotal = 0,
    onCategorize, onAutoCategorize, onLinkSubscription,
    onSetTransfer, onDelete, onClear,
  } = props
  const isAutoRunning = autoCategorizeStatus === 'running'

  const [picker,        setPicker]        = useState<Picker>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The early-return below unmounts the toolbar when the selection is
  // cleared, which naturally resets `picker` and `confirmDelete` state.
  if (count === 0) return null

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none"
      >
        <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {count} selected
          </span>

          {isAutoRunning ? (
            <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="text-foreground">
                Categorizing {autoCategorizeIndex}/{autoCategorizeTotal || '…'}
              </span>
            </div>
          ) : (
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <ToolbarBtn onClick={() => setPicker('category')} disabled={busy}>Categorize…</ToolbarBtn>
              {canAutoCategorize && (
                <ToolbarBtn onClick={onAutoCategorize} disabled={busy} variant="accent">
                  <span className="inline-flex items-center gap-1">
                    <SparkleIcon className="h-3 w-3" />
                    Auto-categorize
                  </span>
                </ToolbarBtn>
              )}
              <ToolbarBtn onClick={() => setPicker('subscription')} disabled={busy}>Subscription…</ToolbarBtn>
              <ToolbarBtn onClick={() => onSetTransfer(true)}  disabled={busy}>Mark transfer</ToolbarBtn>
              <ToolbarBtn onClick={() => onSetTransfer(false)} disabled={busy}>Unmark transfer</ToolbarBtn>
              <ToolbarBtn
                variant="danger"
                onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}
                disabled={busy}
              >
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </ToolbarBtn>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-3">
          <p className="rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-white shadow-lg">{error}</p>
        </div>
      )}

      {picker === 'category' && (
        <CategoryPicker
          categories={categories}
          onPick={async (id) => { await onCategorize(id); setPicker(null) }}
          onClose={() => setPicker(null)}
          busy={busy}
        />
      )}
      {picker === 'subscription' && (
        <SubscriptionPicker
          onPick={async (id) => { await onLinkSubscription(id); setPicker(null) }}
          onClose={() => setPicker(null)}
          busy={busy}
        />
      )}
    </>
  )
}

// ── Pickers ─────────────────────────────────────────────────────────────── //

function CategoryPicker({
  categories, onPick, onClose, busy,
}: {
  categories: CategoryRow[]
  onPick:     (id: string | null) => void
  onClose:    () => void
  busy:       boolean
}) {
  const active = categories.filter((c) => !c.deleted_at)
  return (
    <Modal title="Apply category to selected" onClose={onClose}>
      <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
        <li>
          <PickButton onClick={() => onPick(null)} disabled={busy}>
            <span className="italic text-muted-foreground">— Clear category —</span>
          </PickButton>
        </li>
        {active.map((c) => (
          <li key={c.id}>
            <PickButton onClick={() => onPick(c.id)} disabled={busy}>
              {c.name}
            </PickButton>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function SubscriptionPicker({
  onPick, onClose, busy,
}: {
  onPick:  (id: string | null) => void
  onClose: () => void
  busy:    boolean
}) {
  const [subs, setSubs] = useState<SubscriptionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbClient.subscriptions.list().then((rows) => {
      setSubs(rows.filter((s) => !s.cancelled_on))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <Modal title="Link selected to a subscription" onClose={onClose}>
      {loading ? (
        <p className="px-2 py-4 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
          <li>
            <PickButton onClick={() => onPick(null)} disabled={busy}>
              <span className="italic text-muted-foreground">— Unlink —</span>
            </PickButton>
          </li>
          {subs.map((s) => (
            <li key={s.id}>
              <PickButton onClick={() => onPick(s.id)} disabled={busy}>
                {s.name}
              </PickButton>
            </li>
          ))}
          {subs.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">No subscriptions yet.</li>
          )}
        </ul>
      )}
    </Modal>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-card p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function PickButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="block w-full px-3 py-2.5 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function ToolbarBtn({
  children, onClick, disabled, variant = 'default',
}: {
  children: React.ReactNode
  onClick:  () => void
  disabled?: boolean
  variant?: 'default' | 'danger' | 'accent'
}) {
  const cls = variant === 'danger'
    ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
    : variant === 'accent'
      ? 'bg-primary/10 text-primary hover:bg-primary/20'
      : 'bg-muted hover:bg-muted/70 text-foreground'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576L2.044 12.72a.75.75 0 0 1 0-1.442l2.846-.813a3.75 3.75 0 0 0 2.576-2.576l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036a2.625 2.625 0 0 0 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258a2.625 2.625 0 0 0-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5Z" clipRule="evenodd" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
    </svg>
  )
}
