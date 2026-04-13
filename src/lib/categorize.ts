import { getAiConfig } from './aiConfig'

const OLLAMA_BASE       = 'http://localhost:11434'
const OLLAMA_MODEL      = 'gemma4:e4b'
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_CATEGORIZE ?? 15_000)

export function buildCategorizePrompt(
  description: string,
  categoryNames: string[],
): string {
  return `You are a financial transaction categorizer.
Given a bank transaction description, reply with exactly one category name from the list below.
Do not add any explanation, punctuation, or extra text — only the category name.
If none of the categories fit, reply with: none

Categories:
${categoryNames.join('\n')}

Transaction description: ${description}`
}

/**
 * Asks Ollama to categorize a transaction description against a list of
 * known category names. Returns the matched name, or null if:
 *  - Ollama is not reachable
 *  - The request times out
 *  - The response doesn't match any known category
 *  - The model replies "none"
 *
 * Never throws — all error paths return null.
 */
export async function categorizeWithOllama(
  description: string,
  categoryNames: string[],
  url?:   string,
  model?: string,
): Promise<string | null> {
  const base = (url ?? OLLAMA_BASE).replace(/\/$/, '')

  // Skip silently when deployed — browser can't reach a localhost Ollama (mixed-content + CORS).
  if (typeof window !== 'undefined') {
    const deployed = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    const targetsLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)
    if (deployed && targetsLocalhost) return null
  }

  const ollamaUrl   = `${base}/api/generate`
  const ollamaModel = model ?? OLLAMA_MODEL
  const controller  = new AbortController()
  const timer       = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)

  try {
    const res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:  ollamaModel,
        prompt: buildCategorizePrompt(description, categoryNames),
        stream: false,
      }),
      signal: controller.signal,
    })

    if (!res.ok) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any
    try {
      json = await res.json()
    } catch {
      return null
    }

    const raw: string = typeof json?.response === 'string' ? json.response.trim() : ''
    if (!raw || raw.toLowerCase() === 'none') return null

    const match = categoryNames.find(
      name => name.toLowerCase() === raw.toLowerCase(),
    )
    return match ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Categorizes a transaction using whichever AI provider is configured in Settings.
 * - Ollama: direct browser fetch (works locally only)
 * - Groq / Claude: proxied through /api/ai/categorize (works everywhere)
 *
 * Never throws — all error paths return null.
 */
export async function categorizeWithAI(
  description: string,
  categoryNames: string[],
): Promise<string | null> {
  const cfg = getAiConfig()

  if (cfg.provider === 'ollama') {
    return categorizeWithOllama(description, categoryNames, cfg.ollama.url, cfg.ollama.model)
  }

  // Groq or Claude — proxy through server route
  const apiKey = cfg.provider === 'groq' ? cfg.groq.apiKey : cfg.claude.apiKey
  const model  = cfg.provider === 'groq' ? cfg.groq.model  : cfg.claude.model

  if (!apiKey) return null

  try {
    const res = await fetch('/api/ai/categorize', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Ai-Model':    model,
        'X-Ai-Provider': cfg.provider,
      },
      body: JSON.stringify({ description, categoryNames }),
    })
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any
    const raw: string = typeof json?.category === 'string' ? json.category.trim() : ''
    if (!raw || raw.toLowerCase() === 'none') return null
    return categoryNames.find(n => n.toLowerCase() === raw.toLowerCase()) ?? null
  } catch {
    return null
  }
}
