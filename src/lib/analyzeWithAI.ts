import type { AnalystReport } from './analyst'

const OLLAMA_BASE    = process.env.OLLAMA_URL ?? 'http://localhost:11434'
const OLLAMA_URL     = `${OLLAMA_BASE}/api/generate`
const OLLAMA_MODEL   = process.env.OLLAMA_MODEL ?? 'gemma4:e4b'
const OLLAMA_TIMEOUT = Number(process.env.OLLAMA_TIMEOUT_ANALYZE ?? 60_000)

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const eur = (cents: number) => eurFmt.format(cents / 100)

function buildPrompt(report: AnalystReport): string {
  const { cashFlow, expenseBreakdown, fixedExpenses, anomalies, periodLabel } = report

  const savingsRate = cashFlow.totalIncomeCents > 0
    ? ((cashFlow.netCents / cashFlow.totalIncomeCents) * 100).toFixed(1)
    : 'N/A'

  const fixedTotal = fixedExpenses.reduce((s, f) => s + f.monthlyAvgCents, 0)

  const topCategories = expenseBreakdown.slice(0, 5)
    .map(c => `  - ${c.category}: ${eur(c.totalCents)} (${c.pct.toFixed(1)}%)`)
    .join('\n')

  return `You are a personal finance advisor. Analyze the data below and return exactly 4 bullet points.
Be specific with numbers. Each point max 2 sentences. Start each bullet with "•".
No intro, no outro — just the 4 bullets.

Period: ${periodLabel}
Income:   ${eur(cashFlow.totalIncomeCents)}
Expenses: ${eur(Math.abs(cashFlow.totalExpenseCents))}
Net:      ${eur(cashFlow.netCents)} (savings rate: ${savingsRate}%)
Fixed monthly costs: ${eur(fixedTotal)}/mo
Anomalies detected: ${anomalies.length}

Top expense categories:
${topCategories}

Focus on: savings rate health, dominant spending areas, anything unusual, one actionable suggestion.`
}

export async function analyzeWithAI(report: AnalystReport): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT)

  try {
    const res = await fetch(OLLAMA_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:  OLLAMA_MODEL,
        prompt: buildPrompt(report),
        stream: false,
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`Ollama unavailable — is it running at ${OLLAMA_BASE}?`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json()
    const text: string = typeof json?.response === 'string' ? json.response.trim() : ''
    if (!text) throw new Error('Empty response from model')
    return text
  } catch (err) {
    // Wrap network errors (ECONNREFUSED, AbortError) with a friendly message
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('fetch'))) {
      throw new Error(`Ollama unavailable — is it running at ${OLLAMA_BASE}?`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
