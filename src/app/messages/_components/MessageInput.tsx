'use client'

import { useRef, useState } from 'react'

interface Props {
  onSend:    (body: string) => Promise<void>
  disabled?: boolean
}

export function MessageInput({ onSend, disabled }: Props) {
  const [value,   setValue]   = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  async function handleSend() {
    const body = value.trim()
    if (!body || sending || disabled) return
    setSending(true)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.focus()
    }
    try {
      await onSend(body)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = value.trim().length > 0 && !sending && !disabled

  return (
    <div className="shrink-0 border-t border-border bg-background/80 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-5">
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <div className="flex flex-1 items-end rounded-3xl border border-input bg-card px-4 py-1.5 transition-all focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => { setValue(e.target.value); autoResize() }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={disabled || sending}
            className="flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug placeholder:text-muted-foreground focus:outline-none"
            style={{ maxHeight: '140px' }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 ${
            canSend
              ? 'bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-95'
              : 'bg-muted text-muted-foreground/60'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 -rotate-12">
            <path d="M2.87 2.298a.75.75 0 0 0-.812 1.022l2.218 4.852L8 8.75l-3.724.578-2.218 4.852a.75.75 0 0 0 1.002.978l11.25-5.25a.75.75 0 0 0 0-1.356L2.87 2.298Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
