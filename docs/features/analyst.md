# Analyst

Pure-TS financial analysis: cash flow, expense breakdown, fixed vs variable,
recurring patterns, top merchants, anomalies. Optional AI commentary on top.

## Routes / API

| Method | Path                          | File |
|--------|-------------------------------|------|
| client | `/analyst`                    | `src/app/analyst/page.tsx` |
| POST   | `/api/ai/analyze`             | `src/app/api/ai/analyze/route.ts` — Claude / Groq proxy. |

## Database

No dedicated schema. Reads `transactions` for the selected period via
`listByDateRange(start, end)`.

## Library — `src/lib/analyst.ts`

`buildReport(txs, startDate, endDate): AnalystReport` is the engine. Pure,
deterministic, zero deps. It produces:

| Section | What it computes |
|---------|------------------|
| `CashFlowSummary` | Total income / expense / net, transfer count, savings rate. |
| `IncomeBreakdownItem[]` | Income grouped by parent category, sorted by amount. |
| `ExpenseBreakdownItem[]` | Expenses grouped by parent + subcategory, with % of total. |
| `FixedExpenseItem[]` | Recurring ≥ 3 distinct months and `(max-min)/mean < 30%`. |
| `VariableExpenseItem[]` | Non-fixed expenses, ranked. |
| `RecurringItem[]` | Median interval ± 10 days; classified as weekly / biweekly / monthly. |
| `MerchantItem[]` | Top 10 normalised descriptions. |
| `AnomalyItem[]` | Three rules: very-large (`> 5× median`), category outlier (mean + 3σ), possible duplicate (same desc + amount within ±3 days). |

Description normalisation strips bank prefixes (Kartenzahlung, SEPA, etc.),
trailing reference codes (4+ digits, 6+ uppercase alphanumerics), collapses
whitespace, and takes the first 5 words.

## Library — `src/lib/analyzeWithAI.ts`

Wrapper around the AI provider config (see [ai-configuration](./ai-configuration.md)):

- `buildPrompt(report)` — turns the structured report into a compact prompt
  (period, totals, savings %, fixed-monthly, anomaly count, top 5 categories).
- `analyzeWithOllama(report, url, model)` — direct browser fetch
  (localhost only).
- `analyzeWithClaude(report, key, model)` — proxies through `/api/ai/analyze`.
- `analyzeWithGroq(report, key, model)` — same.
- `analyzeWithAI(report, config?)` — dispatches by `config.provider`.

## React layer

- `src/app/analyst/_hooks/useAnalyst.ts` — `generate(months, customStart?, customEnd?)`
  loads transactions and runs `buildReport`. `generateInsights()` calls
  `analyzeWithAI` for the optional AI card.
- `src/app/analyst/page.tsx` — period picker (1M / 3M / 6M / 12M / custom),
  cards: CashFlowCard, IncomeBreakdownCard, ExpenseBreakdownCard,
  FixedVariableCard, RecurringCard, MerchantCard, AnomaliesCard, AiInsightsCard.
- `src/app/api/ai/analyze/route.ts` — server endpoint. Accepts the report
  + provider/model, validates with Zod, calls Anthropic or Groq, returns four
  formatted bullets.

## How it works

1. **Pick a period.** 1 / 3 / 6 / 12 months relative to today, or a custom
   range.
2. The hook calls `dbClient.transactions.listByDateRange(start, end)`.
3. `buildReport(txs, start, end)` runs purely in TS:
   - Classifies rows: `is_transfer` → transfers; positive → income; negative
     → expense.
   - Groups income by parent category. Groups expenses by parent +
     subcategory.
   - Detects fixed expenses: normalise descriptions, find any pattern that
     recurs in ≥ 3 distinct months with `(max - min) / mean < 30%`.
   - Detects recurring: median interval ± 10 days, classify by interval
     (weekly / biweekly / monthly).
   - Top 10 merchants by normalised description.
   - Anomalies via three orthogonal rules. Skips known-regular rows so
     monthly rent isn't flagged as anomalous.
4. The page renders cards from the report — no AI is needed for the core
   output.
5. **Generate insights (optional).** The user clicks a button. The hook
   calls `analyzeWithAI(report)` which, depending on provider:
   - **Ollama** → direct fetch to `localhost:11434/api/generate` (works only
     on localhost, blocked by mixed-content on a deployed origin).
   - **Claude / Groq** → POST to `/api/ai/analyze`. The route validates,
     calls Anthropic / Groq with a compact prompt, and returns four bullets
     of natural-language commentary.

## Environment variables

The AI providers read from the per-user, per-device config in localStorage —
see [ai-configuration](./ai-configuration.md). API keys are never sent to
the server permanently; they ride the request as a Bearer header that the
`/api/ai/*` route forwards to the upstream provider.

## Notable details

- **Description normalisation matters.** Bank exports include random
  reference numbers and prefixes; without normalisation, the recurring /
  merchant detector can't see that 12 different rows are the same payee.
- **Conservative thresholds.** Fixed-expense detection requires ≥ 3 months
  *and* < 30% variance. A 1-month sample is intentionally insufficient.
- **Period label off-by-one.** The custom-range UI takes inclusive end-dates,
  but `buildReport` uses an exclusive endDate internally; the helper
  `addDays(endDate, -1)` is used for the period-label string.
- **Savings rate** = `net / income`; `null` if income is zero.
- **No DB writes.** The analyst feature is purely read-only.
