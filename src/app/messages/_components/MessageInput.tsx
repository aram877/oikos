'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  onSend: (body: string) => Promise<void>
}

export function MessageInput({ onSend }: Props) {
  const [value,   setValue]   = useState('')
  const [sending, setSending] = useState('')
  const textareaRef           = useRef<HTMLTextAreaElement>(null)

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 104)}px` // max ~4 rows
  }

  async function handleSend() {
    const body = value.trim()
    if (!body || sending) return
    setSending('sending')
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    try {
      await onSend(body)
    } finally {
      setSending('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => { setValue(e.target.value); autoResize() }}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring leading-5"
          style={{ minHeight: '44px', maxHeight: '104px' }}
          disabled={!!sending}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!value.trim() || !!sending}
          className="shrink-0"
          aria-label="Send message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path d="M2.87 2.298a.75.75 0 0 0-.812 1.022l2.218 4.852L8 8.75l-3.724.578-2.218 4.852a.75.75 0 0 0 1.002.978l11.25-5.25a.75.75 0 0 0 0-1.356L2.87 2.298Z" />
          </svg>
        </Button>
      </div>
    </div>
  )
}
