'use client'

import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  onAdd: (name: string, quantity?: string) => Promise<void>
}

export function AddItemForm({ onAdd }: Props) {
  const [name, setName]         = useState('')
  const [quantity, setQuantity] = useState('')
  const [busy, setBusy]         = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || busy) return
    setBusy(true)
    try {
      await onAdd(trimmedName, quantity.trim() || undefined)
      setName('')
      setQuantity('')
      nameRef.current?.focus()
    } catch {
      // Error surfaced by hook
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add an item…"
        disabled={busy}
        className="min-w-0 flex-1"
      />
      <Input
        type="text"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="Qty"
        disabled={busy}
        className="w-20"
      />
      <Button
        type="submit"
        disabled={!name.trim() || busy}
      >
        Add
      </Button>
    </form>
  )
}
