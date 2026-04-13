import { NextRequest, NextResponse } from 'next/server'

const VALID_GROQ_MODELS   = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']
const DEFAULT_GROQ_MODEL  = 'llama-3.3-70b-versatile'
const VALID_CLAUDE_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6']
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001'

function buildPrompt(description: string, categoryNames: string[]): string {
  return `You are a financial transaction categorizer.
Given a bank transaction description, reply with exactly one category name from the list below.
Do not add any explanation, punctuation, or extra text — only the category name.
If none of the categories fit, reply with: none

Categories:
${categoryNames.join('\n')}

Transaction description: ${description}`
}

function matchCategory(text: string, categoryNames: string[]): string | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.toLowerCase() === 'none') return null
  return categoryNames.find(n => n.toLowerCase() === trimmed.toLowerCase()) ?? null
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = req.headers.get('authorization') ?? ''
  const apiKey = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!apiKey) return NextResponse.json({ error: 'Missing API key.' }, { status: 400 })

  // 2. Provider + model
  const provider    = req.headers.get('x-ai-provider') ?? 'claude'
  const modelHeader = req.headers.get('x-ai-model') ?? ''

  // 3. Body
  let description: string, categoryNames: string[]
  try {
    const body = await req.json()
    if (typeof body?.description !== 'string' || !Array.isArray(body?.categoryNames)) {
      throw new Error('invalid body')
    }
    description   = body.description as string
    categoryNames = body.categoryNames as string[]
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const prompt = buildPrompt(description, categoryNames)

  // ── Groq ──────────────────────────────────────────────────────────────── //
  if (provider === 'groq') {
    const model = VALID_GROQ_MODELS.includes(modelHeader) ? modelHeader : DEFAULT_GROQ_MODEL
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body:    JSON.stringify({ model, max_tokens: 50, messages: [{ role: 'user', content: prompt }] }),
      })
      if (!res.ok) return NextResponse.json({ category: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as any
      return NextResponse.json({ category: matchCategory(data?.choices?.[0]?.message?.content ?? '', categoryNames) })
    } catch {
      return NextResponse.json({ category: null })
    }
  }

  // ── Claude (default) ──────────────────────────────────────────────────── //
  const model = VALID_CLAUDE_MODELS.includes(modelHeader) ? modelHeader : DEFAULT_CLAUDE_MODEL
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return NextResponse.json({ category: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any
    return NextResponse.json({ category: matchCategory(data?.content?.[0]?.text ?? '', categoryNames) })
  } catch {
    return NextResponse.json({ category: null })
  }
}
