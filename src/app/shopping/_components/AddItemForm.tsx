'use client'

import { useRef, useState } from 'react'

interface Props {
  onAdd: (name: string, quantity?: string) => Promise<void>
}

export function AddItemForm({ onAdd }: Props) {
  const [name, setName]         = useState('')
  const [quantity, setQuantity] = useState('')
  const [busy, setBusy]         = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  async function submit() {
    const trimmedName = name.trim()
    if (!trimmedName || busy) return
    setBusy(true)
    try {
      await onAdd(trimmedName, quantity.trim() || undefined)
      setName('')
      setQuantity('')
      nameRef.current?.focus()
    } catch {
      // Error surfaced by hook; nothing extra to do here
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="mb-6 flex gap-2">
      <input
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Item name"
        disabled={busy}
        className="min-w-0 flex-1 rounded border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
      />
      <input
        type="text"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Qty"
        disabled={busy}
        className="w-20 rounded border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-500"
      />
      <button
        onClick={submit}
        disabled={!name.trim() || busy}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        Add
      </button>
    </div>
  )
}
