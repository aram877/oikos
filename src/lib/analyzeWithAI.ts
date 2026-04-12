import type { AnalystReport } from './analyst'
import { getAiConfig, type AiConfig } from './aiConfig'

const OLLAMA_TIMEOUT = Number(process.env.OLLAMA_TIMEOUT_ANALYZE ?? 60_000)

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const eur = (cents: number) => eurFmt.format(cents / 100)

export function buildPrompt(report: AnalystReport): string {
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

async function analyzeWithOllama(report: AnalystReport, cfg: AiConfig): Promise<string> {
  const base = cfg.ollama.url.replace(/\/$/, '')
  const url  = `${base}/api/generate`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT)

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        model:  cfg.ollama.model,
        prompt: buildPrompt(report),
        stream: false,
      }),
      signal: controller.signal,
    })

    if (!res.ok) throw new Error(`Ollama unavailable — is it running at ${base}?`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json()
    const text: string = typeof json?.response === 'string' ? json.response.trim() : ''
    if (!text) throw new Error('Empty response from model')
    return text
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('fetch'))) {
      throw new Error(`Ollama unavailable — is it running at ${base}?`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function analyzeWithClaude(report: AnalystReport, cfg: AiConfig): Promise<string> {
  if (!cfg.claude.apiKey) {
    throw new Error('Claude API key not configured. Go to Settings → AI Configuration.')
  }

  let res: Response
  try {
    res = await fetch('/api/ai/analyze', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cfg.claude.apiKey}`,
        'X-Ai-Model':    cfg.claude.model,
      },
      body: JSON.stringify({ report }),
    })
  } catch {
    throw new Error('Network error — could not reach the AI analysis endpoint.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json()

  if (!res.ok) {
    throw new Error(json?.error ?? `Request failed (${res.status})`)
  }

  return json.text as string
}

export async function analyzeWithAI(report: AnalystReport, config?: AiConfig): Promise<string> {
  const cfg = config ?? getAiConfig()
  if (cfg.provider === 'claude') {
    return analyzeWithClaude(report, cfg)
  }
  return analyzeWithOllama(report, cfg)
}
