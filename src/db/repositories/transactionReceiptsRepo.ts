import type { TransactionReceiptRow, TransactionReceiptWithUrl } from '../types'
import { getSupabase } from '../supabase'
import { getActiveAccountId } from '../accountContext'

const BUCKET = 'receipts'
const SIGNED_URL_TTL_SECONDS = 60 * 5  // 5 minutes — comfortably outlasts a render
const MAX_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']

// ── Helpers ─────────────────────────────────────────────────────────────── //

function extensionFor(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() ?? '' : ''
  if (fromName) return fromName.toLowerCase()
  // Fallback for clipboard-pasted blobs that have no name.
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type.startsWith('image/'))  return file.type.split('/')[1] ?? 'bin'
  return 'bin'
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function requireUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('[transactionReceiptsRepo] Not authenticated')
  return id
}

function assertAcceptable(file: File): void {
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.`)
  }
  if (!ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
    throw new Error(`Unsupported file type: ${file.type || 'unknown'}. Use an image or PDF.`)
  }
}

async function signUrls(rows: TransactionReceiptRow[]): Promise<TransactionReceiptWithUrl[]> {
  if (rows.length === 0) return []
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS)
  if (error) throw new Error(`[transactionReceiptsRepo.signUrls] ${error.message}`)

  const urlByPath = new Map<string, string>()
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl)
  }
  return rows.map((r) => ({ ...r, signed_url: urlByPath.get(r.storage_path) ?? '' }))
}

// ── Queries ─────────────────────────────────────────────────────────────── //

/**
 * Lists every receipt attached to a transaction, with a freshly-issued
 * signed URL for inline rendering.
 */
export async function listReceipts(transactionId: string): Promise<TransactionReceiptWithUrl[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('transaction_receipts')
    .select('id, transaction_id, account_id, storage_path, mime_type, size_bytes, original_name, uploaded_by, created_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`[transactionReceiptsRepo.listReceipts] ${error.message}`)
  return signUrls((data ?? []) as TransactionReceiptRow[])
}

/**
 * Uploads a file to the receipts bucket and inserts a metadata row.
 * Returns the new row with a signed URL ready for rendering.
 */
export async function insertReceipt(
  transactionId: string,
  file: File,
): Promise<TransactionReceiptWithUrl> {
  assertAcceptable(file)

  const supabase  = getSupabase()
  const accountId = await getActiveAccountId()
  const userId    = await requireUserId()

  const ext  = extensionFor(file)
  const path = `${accountId}/${transactionId}/${randomId()}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (uploadErr) throw new Error(`[transactionReceiptsRepo.insertReceipt:upload] ${uploadErr.message}`)

  const { data: row, error: insertErr } = await supabase
    .from('transaction_receipts')
    .insert({
      transaction_id: transactionId,
      account_id:     accountId,
      storage_path:   path,
      mime_type:      file.type || 'application/octet-stream',
      size_bytes:     file.size,
      original_name:  file.name || null,
      uploaded_by:    userId,
    })
    .select('id, transaction_id, account_id, storage_path, mime_type, size_bytes, original_name, uploaded_by, created_at')
    .single()

  if (insertErr || !row) {
    // Roll back the storage object so we don't leak orphans.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
    throw new Error(`[transactionReceiptsRepo.insertReceipt:insert] ${insertErr?.message ?? 'no row'}`)
  }

  const [withUrl] = await signUrls([row as TransactionReceiptRow])
  return withUrl
}

/**
 * Deletes a receipt: the storage object first, then the row.
 */
export async function deleteReceipt(id: string): Promise<void> {
  const supabase = getSupabase()

  const { data: row, error: getErr } = await supabase
    .from('transaction_receipts')
    .select('storage_path')
    .eq('id', id)
    .single()
  if (getErr) throw new Error(`[transactionReceiptsRepo.deleteReceipt:fetch] ${getErr.message}`)
  if (!row) return

  const { error: storageErr } = await supabase.storage.from(BUCKET).remove([row.storage_path])
  if (storageErr) throw new Error(`[transactionReceiptsRepo.deleteReceipt:storage] ${storageErr.message}`)

  const { error: dbErr } = await supabase.from('transaction_receipts').delete().eq('id', id)
  if (dbErr) throw new Error(`[transactionReceiptsRepo.deleteReceipt:row] ${dbErr.message}`)
}

/**
 * Returns receipt counts for a batch of transaction ids.  One round-trip;
 * used by the list page's paperclip indicator.
 */
export async function getReceiptCounts(transactionIds: string[]): Promise<Record<string, number>> {
  if (transactionIds.length === 0) return {}
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('get_receipt_counts', {
    p_transaction_ids: transactionIds,
  })
  if (error) throw new Error(`[transactionReceiptsRepo.getReceiptCounts] ${error.message}`)

  const map: Record<string, number> = {}
  for (const row of (data ?? []) as { transaction_id: string; count: number | string }[]) {
    map[row.transaction_id] = Number(row.count)
  }
  return map
}
