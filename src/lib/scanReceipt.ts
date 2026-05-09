/**
 * Client wrapper around /api/ai/scan-receipt.
 *
 * Sends the file to the server proxy with the user's Claude API key in the
 * Authorization header (matches the pattern used by /categorize and /analyze).
 * Returns the structured extraction or throws with a user-readable message.
 */

import { getAiConfig } from './aiConfig'

export interface ReceiptExtraction {
  merchant:     string | null
  amount_cents: number | null
  date:         string | null
  currency:     string | null
}

export interface ScanReceiptResult {
  result: ReceiptExtraction
  model:  string
}

export class ScanReceiptError extends Error {
  constructor(message: string, public readonly userVisible = true) {
    super(message)
    this.name = 'ScanReceiptError'
  }
}

/**
 * Throws ScanReceiptError if the AI provider isn't configured for vision
 * or the API call fails.  Consumer should catch and surface `error.message`.
 */
export async function scanReceipt(file: File): Promise<ScanReceiptResult> {
  const config = getAiConfig()

  if (config.provider !== 'claude') {
    throw new ScanReceiptError(
      'Receipt scan needs Claude. Open Settings → AI configuration to switch providers.',
    )
  }
  if (!config.claude.apiKey) {
    throw new ScanReceiptError(
      'Add your Claude API key in Settings → AI configuration to scan receipts.',
    )
  }

  const form = new FormData()
  form.append('file', file)

  const res = await fetch('/api/ai/scan-receipt', {
    method:  'POST',
    headers: {
      'Authorization':   `Bearer ${config.claude.apiKey}`,
      'X-Ai-Provider':   'claude',
      'X-Ai-Model':      config.claude.model,
    },
    body: form,
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => null) as { error?: string } | null
    throw new ScanReceiptError(errBody?.error ?? `Scan failed (${res.status}).`)
  }

  return res.json() as Promise<ScanReceiptResult>
}
