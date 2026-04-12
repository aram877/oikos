import { NextRequest, NextResponse } from 'next/server'
import { buildPrompt } from '@/lib/analyzeWithAI'
import type { AnalystReport } from '@/lib/analyst'

const VALID_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export async function POST(req: NextRequest) {
  // 1. Extract Bearer token
  const auth = req.headers.get('authorization') ?? ''
  const apiKey = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key.' }, { status: 400 })
  }

  // 2. Extract model
  const modelHeader = req.headers.get('x-ai-model') ?? ''
  const model = VALID_MODELS.includes(modelHeader) ? modelHeader : DEFAULT_MODEL

  // 3. Parse body
  let report: AnalystReport
  try {
    const body = await req.json()
    if (!body?.report) throw new Error('missing report')
    report = body.report as AnalystReport
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  // 4. Call Anthropic
  let anthropicRes: Response
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
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

  // 5. Handle response
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
