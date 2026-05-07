'use client'

import { useEffect, useRef, useState } from 'react'
import type { TransactionReceiptWithUrl } from '@/db/types'
import { useReceipts } from '../_hooks/useReceipts'

interface Props {
  transactionId: string
  /** When false, hide upload + delete affordances (read-only finance access). */
  canEdit:       boolean
}

const ACCEPT = 'image/*,application/pdf'

export function ReceiptsSection({ transactionId, canEdit }: Props) {
  const { items, status, error, upload, remove } = useReceipts(transactionId)
  const [uploading, setUploading]   = useState(false)
  const [uploadErr, setUploadErr]   = useState<string | null>(null)
  const [dragOver,  setDragOver]    = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | File[]) {
    if (!canEdit) return
    setUploadErr(null)
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        await upload(f)
      }
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-foreground">Receipts</h2>
        <span className="text-xs text-muted-foreground">
          {items.length === 0 ? 'None attached' : `${items.length} attached`}
        </span>
      </div>

      {status === 'error' && (
        <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error ?? 'Failed to load receipts.'}
        </p>
      )}

      {/* Thumbnail grid */}
      {items.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((r, i) => (
            <li key={r.id}>
              <Thumbnail
                receipt={r}
                onOpen={() => setLightboxIdx(i)}
                onDelete={canEdit ? () => remove(r.id).catch(() => {}) : null}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Upload zone */}
      {canEdit && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border bg-muted/30 hover:border-foreground/40 hover:bg-muted/60'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={uploading}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="sr-only"
          />
          <PaperclipIcon className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">
            {uploading ? 'Uploading…' : items.length === 0 ? 'Add a receipt' : 'Add another'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Drop or click — images or PDFs, up to 10 MB
          </p>
        </label>
      )}

      {uploadErr && (
        <p className="mt-2 text-xs text-destructive">{uploadErr}</p>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && items[lightboxIdx] && (
        <Lightbox
          receipts={items}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </section>
  )
}

// ── Thumbnail ──────────────────────────────────────────────────────────────── //

function Thumbnail({
  receipt, onOpen, onDelete,
}: {
  receipt:  TransactionReceiptWithUrl
  onOpen:   () => void
  onDelete: (() => void) | null
}) {
  const isImage = receipt.mime_type.startsWith('image/')
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onOpen}
        className="block h-full w-full text-left"
        aria-label={`Open receipt ${receipt.original_name ?? ''}`}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receipt.signed_url}
            alt={receipt.original_name ?? 'Receipt'}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-muted-foreground">
            <PdfIcon className="h-7 w-7" />
            <span className="line-clamp-2 text-center text-[10px] leading-tight">
              {receipt.original_name ?? 'PDF'}
            </span>
          </div>
        )}
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (!confirming) { setConfirming(true); return }
            onDelete()
          }}
          onBlur={() => setConfirming(false)}
          aria-label={confirming ? 'Confirm delete' : 'Delete receipt'}
          className={`absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full transition-all ${
            confirming
              ? 'bg-destructive text-white opacity-100'
              : 'bg-black/55 text-white opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          {confirming ? <CheckIcon className="h-3.5 w-3.5" /> : <TrashIcon className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}

// ── Lightbox ───────────────────────────────────────────────────────────────── //

function Lightbox({
  receipts, startIndex, onClose,
}: {
  receipts:   TransactionReceiptWithUrl[]
  startIndex: number
  onClose:    () => void
}) {
  const [idx, setIdx] = useState(startIndex)
  const r = receipts[idx]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(i + 1, receipts.length - 1))
      else if (e.key === 'ArrowLeft')  setIdx((i) => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, receipts.length])

  const isImage = r.mime_type.startsWith('image/')

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <a
          href={r.signed_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
        >
          Open original
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {receipts.length > 1 && (
        <>
          <button
            type="button"
            disabled={idx === 0}
            onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.max(i - 1, 0)) }}
            aria-label="Previous"
            className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-30"
          >
            <ChevronIcon className="h-5 w-5 rotate-180" />
          </button>
          <button
            type="button"
            disabled={idx === receipts.length - 1}
            onClick={(e) => { e.stopPropagation(); setIdx((i) => Math.min(i + 1, receipts.length - 1)) }}
            aria-label="Next"
            className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-30"
          >
            <ChevronIcon className="h-5 w-5" />
          </button>
        </>
      )}

      <div onClick={(e) => e.stopPropagation()} className="relative max-h-full max-w-full">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.signed_url}
            alt={r.original_name ?? 'Receipt'}
            className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          />
        ) : (
          <iframe
            src={r.signed_url}
            title={r.original_name ?? 'Receipt PDF'}
            className="h-[88vh] w-[92vw] max-w-3xl rounded-lg bg-white shadow-2xl"
          />
        )}
        <p className="mt-3 truncate text-center text-xs text-white/80">
          {r.original_name ?? 'Receipt'} · {(r.size_bytes / 1024).toFixed(0)} KB
          {receipts.length > 1 && ` · ${idx + 1}/${receipts.length}`}
        </p>
      </div>
    </div>
  )
}

// ── Icons (single file; tiny) ──────────────────────────────────────────────── //

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21 11-9.04 9.06a4.5 4.5 0 1 1-6.36-6.37l9.06-9.06a3 3 0 1 1 4.24 4.24l-9.04 9.06a1.5 1.5 0 0 1-2.12-2.12l8.34-8.34" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z" clipRule="evenodd" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0L2.22 9.78a.75.75 0 0 1 1.06-1.06l2.47 2.47 6.97-6.97a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
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

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 1 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
    </svg>
  )
}

function PdfIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875Zm5.845 17.03a.75.75 0 0 0 1.06 0l3-3a.75.75 0 1 0-1.06-1.06l-1.72 1.72V12a.75.75 0 0 0-1.5 0v4.19l-1.72-1.72a.75.75 0 0 0-1.06 1.06l3 3Z" clipRule="evenodd" />
      <path d="M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z" />
    </svg>
  )
}
