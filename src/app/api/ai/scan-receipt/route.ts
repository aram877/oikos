import { NextRequest, NextResponse } from 'next/server'

const VALID_CLAUDE_MODELS  = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'] as const
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

const MAX_BYTES        = 10 * 1024 * 1024
const ALLOWED_MIMES    = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
const ANTHROPIC_VERSION = '2023-06-01'

const PROMPT = [
  'You are extracting structured data from a receipt or invoice image.',
  '',
  'Return ONLY a single JSON object — no prose, no markdown, no code fences — with EXACTLY these four fields:',
  '{',
  '  "merchant": string | null,        // store or vendor name; no addresses, no city',
  '  "amount_cents": number | null,    // grand total in CENTS as a positive integer (€12.50 → 1250)',
  '  "date": string | null,            // ISO date YYYY-MM-DD if a transaction date is visible',
  '  "currency": string | null         // ISO 4217 code if shown (e.g. "EUR")',
  '}',
  '',
  'Rules:',
  '- Use the FINAL grand total after tax and discounts.',
  '- If a field is unclear or not visible, use null. Do not guess.',
  '- Reply with the JSON object only.',
].join('\n')

interface ExtractedReceipt {
  merchant:     string | null
  amount_cents: number | null
  date:         string | null
  currency:     string | null
}

function emptyResult(): ExtractedReceipt {
  return { merchant: null, amount_cents: null, date: null, currency: null }
}

/** Pull the first {…} block out of the model's reply and JSON-parse it. */
function parseExtraction(raw: string): ExtractedReceipt {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return emptyResult()
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const out = emptyResult()
    if (typeof parsed.merchant === 'string') out.merchant = parsed.merchant.trim() || null
    if (typeof parsed.amount_cents === 'number' && Number.isFinite(parsed.amount_cents)) {
      out.amount_cents = Math.max(0, Math.round(parsed.amount_cents))
    }
    if (typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
      out.date = parsed.date
    }
    if (typeof parsed.currency === 'string' && /^[A-Z]{3}$/.test(parsed.currency.toUpperCase())) {
      out.currency = parsed.currency.toUpperCase()
    }
    return out
  } catch {
    return emptyResult()
  }
}

export async function POST(req: NextRequest) {
  // 1. API key
  const auth   = req.headers.get('authorization') ?? ''
  const apiKey = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!apiKey) return NextResponse.json({ error: 'Missing API key.' }, { status: 400 })

  // 2. Provider gating — vision is Claude-only in MVP.
  const provider = (req.headers.get('x-ai-provider') ?? 'claude').toLowerCase()
  if (provider !== 'claude') {
    return NextResponse.json(
      { error: 'Receipt scan requires Claude. Switch the AI provider in Settings.' },
      { status: 400 },
    )
  }
  const modelHeader = req.headers.get('x-ai-model') ?? ''
  const model       = (VALID_CLAUDE_MODELS as readonly string[]).includes(modelHeader)
    ? modelHeader
    : DEFAULT_CLAUDE_MODEL

  // 3. File
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).` }, { status: 400 })
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || 'unknown'}.` }, { status: 400 })
  }

  // 4. Build the Claude content payload — image vs document depending on MIME.
  const bytes  = new Uint8Array(await file.arrayBuffer())
  const base64 = Buffer.from(bytes).toString('base64')

  const visualBlock = file.type === 'application/pdf'
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf', data: base64 } }
    : { type: 'image'    as const, source: { type: 'base64' as const, media_type: file.type,        data: base64 } }

  // 5. Anthropic call
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [visualBlock, { type: 'text', text: PROMPT }],
        }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Anthropic API error (${res.status}): ${errText.slice(0, 200) || 'unknown'}` },
        { status: 502 },
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any
    const text = (data?.content ?? []).find((c: { type?: string }) => c.type === 'text')?.text ?? ''
    return NextResponse.json({ result: parseExtraction(text), model })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Network error.' },
      { status: 502 },
    )
  }
}
