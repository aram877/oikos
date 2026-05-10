import { NextRequest, NextResponse } from 'next/server'
import { buildPrompt } from '@/lib/analyzeWithAI'
import type { AnalystReport } from '@/lib/analyst'
import { createClient } from '@/lib/supabase/server'

const VALID_CLAUDE_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

const VALID_GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

const MAX_REPORT_BYTES = 256 * 1024

export async function POST(req: NextRequest) {
  // 0. Require an authenticated Oikos user.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 0a. Cap input size before parsing.
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: 'Report too large.' }, { status: 413 })
  }

  // 1. Extract Bearer token
  const auth = req.headers.get('authorization') ?? ''
  const apiKey = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key.' }, { status: 400 })
  }

  // 2. Provider + model
  const provider    = req.headers.get('x-ai-provider') ?? 'claude'
  const modelHeader = req.headers.get('x-ai-model') ?? ''

  // 3. Parse body
  let report: AnalystReport
  try {
    const body = await req.json()
    if (!body?.report) throw new Error('missing report')
    report = body.report as AnalystReport
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  // ── Groq ──────────────────────────────────────────────────────────────────
  if (provider === 'groq') {
    const model = VALID_GROQ_MODELS.includes(modelHeader) ? modelHeader : DEFAULT_GROQ_MODEL

    let groqRes: Response
    try {
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: buildPrompt(report) }],
        }),
      })
    } catch {
      return NextResponse.json({ error: 'Network error reaching Groq API.' }, { status: 502 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await groqRes.json()

    if (!groqRes.ok) {
      const status = groqRes.status
      let message = data?.error?.message ?? `Groq error (${status})`
      if (status === 401) message = 'Invalid Groq API key.'
      if (status === 429) message = 'Rate limit exceeded. Try again later.'
      return NextResponse.json({ error: message }, { status })
    }

    const text: string = data?.choices?.[0]?.message?.content ?? ''
    return NextResponse.json({ text })
  }

  // ── Claude (default) ──────────────────────────────────────────────────────
  const model = VALID_CLAUDE_MODELS.includes(modelHeader) ? modelHeader : DEFAULT_CLAUDE_MODEL

  let anthropicRes: Response
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildPrompt(report) }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'Network error reaching Anthropic API.' }, { status: 502 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await anthropicRes.json()

  if (!anthropicRes.ok) {
    const status = anthropicRes.status
    let message = data?.error?.message ?? `Anthropic error (${status})`
    if (status === 401) message = 'Invalid API key.'
    if (status === 429) message = 'Rate limit exceeded. Try again later.'
    if (status === 529) message = 'Anthropic is overloaded. Try again later.'
    return NextResponse.json({ error: message }, { status })
  }

  const text: string = data?.content?.[0]?.text ?? ''
  return NextResponse.json({ text })
}
