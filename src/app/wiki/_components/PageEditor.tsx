'use client'

import { useState } from 'react'
import { MarkdownView } from './MarkdownView'

interface Props {
  initialTitle: string
  initialBody:  string
  busy:         boolean
  /** Save returns when the change is persisted. */
  onSave:       (input: { title: string; body: string }) => Promise<void>
  onCancel:     () => void
  onDelete?:    (() => Promise<void>) | null
  saveLabel?:   string
}

type Tab = 'write' | 'preview'

export function PageEditor({
  initialTitle, initialBody, busy, onSave, onCancel, onDelete, saveLabel = 'Save',
}: Props) {
  const [title, setTitle] = useState(initialTitle)
  const [body,  setBody]  = useState(initialBody)
  const [tab,   setTab]   = useState<Tab>('write')
  const [confirmDel, setConfirmDel] = useState(false)
  const [err,   setErr]   = useState<string | null>(null)

  async function submit() {
    setErr(null)
    if (!title.trim()) { setErr('Title is required.'); return }
    try {
      await onSave({ title: title.trim(), body })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Page title — e.g. How to reset the boiler"
        disabled={busy}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base font-semibold focus:outline-none focus:border-ring"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-full bg-muted p-1 text-xs">
          <TabBtn active={tab === 'write'}   onClick={() => setTab('write')}>Write</TabBtn>
          <TabBtn active={tab === 'preview'} onClick={() => setTab('preview')}>Preview</TabBtn>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Markdown · headings, bold, lists, code, tables, links
        </span>
      </div>

      {tab === 'write' ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'# Section\n\nWrite anything here in markdown.\n\n- bullet\n- another bullet\n\n[Link](https://example.com)'}
          disabled={busy}
          rows={16}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-sm leading-relaxed focus:outline-none focus:border-ring resize-y"
        />
      ) : (
        <div className="min-h-[16rem] rounded-lg border border-input bg-card px-4 py-3">
          {body.trim()
            ? <MarkdownView source={body} />
            : <p className="text-sm italic text-muted-foreground">Nothing to preview yet.</p>}
        </div>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          confirmDel ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => { await onDelete() }}
                disabled={busy}
                className="rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDel(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              disabled={busy}
              className="text-xs text-destructive hover:underline disabled:opacity-50"
            >
              Delete page
            </button>
          )
        ) : <span />}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim()}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function TabBtn({
  active, onClick, children,
}: {
  active:   boolean
  onClick:  () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
