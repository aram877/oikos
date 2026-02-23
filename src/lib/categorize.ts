const OLLAMA_URL = 'http://localhost:11434/api/generate'
const OLLAMA_MODEL = 'llama3.2'
const OLLAMA_TIMEOUT_MS = 15_000

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
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS)

  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
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
