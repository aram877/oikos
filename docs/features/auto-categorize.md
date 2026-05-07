# Auto-Categorize (AI)

A batch classifier that fills empty `category_id`s by asking an AI to pick a
category from the user's list, given a transaction's description.

## Routes / API

| Method | Path                          | File |
|--------|-------------------------------|------|
| POST   | `/api/ai/categorize`          | `src/app/api/ai/categorize/route.ts` — Claude / Groq proxy. |

There is no dedicated UI route — the feature is a button on
`/transactions` and on `/yearly`.

## Database

No dedicated tables. Reads `transactions` (uncategorized rows) and
`categories`; writes `transactions.category_id`.

## Library — `src/lib/categorize.ts`

| Function | Purpose |
|----------|---------|
| `buildCategorizePrompt(description, names)` | Single-pass prompt: "reply with exactly one category from list, or 'none'". |
| `categorizeWithOllama(description, names, url?, model?)` | Direct browser fetch; 15s timeout; returns `null` on any error. |
| `categorizeWithAI(description, names)` | Reads the AI config (see [ai-configuration](./ai-configuration.md)) and dispatches: Ollama direct, Claude/Groq via `/api/ai/categorize`. |

The server route validates inputs with Zod, calls the configured provider
with the prompt, and matches the response against the provided category
names case-insensitively. If the model says "none" or returns something
unrecognised, the route returns `null` — never throws.

## React integration

- `src/app/transactions/_hooks/useAutoCategorize.ts` — invoked from a button
  on the transactions list. It loads `listUncategorized()`, then for each row
  calls `categorizeWithAI(description, [category names])`. On a non-null
  response it `dbClient.transactions.update(id, { category_id })`.
- `src/app/yearly/page.tsx` exposes an "Auto-categorize all" button using
  the same hook against the year's range.

## How it works

1. The user clicks "Auto-categorize". The hook lists uncategorized rows for
   the relevant scope (current month / year / global).
2. For each row it calls `categorizeWithAI(description, allCategoryNames)`.
3. The function:
   - Builds the prompt with `buildCategorizePrompt`.
   - **Ollama**: direct browser fetch to `localhost:11434/api/generate` with
     a 15s timeout.
   - **Claude / Groq**: POST to `/api/ai/categorize` with `description`,
     `categoryNames`, and the API key in the Authorization header. The
     `X-Ai-Provider` and `X-Ai-Model` headers select the upstream.
4. The route returns either the matched category name (string) or `null`.
5. If non-null, the hook resolves the name → category id and updates the
   row.
6. UI shows live progress (`current / total · applied N`).

## Environment variables

API keys are stored per-user in `localStorage` via `useAiConfig()`; see
[ai-configuration](./ai-configuration.md). Defaults:

- Ollama URL: `NEXT_PUBLIC_OLLAMA_URL` (default `http://localhost:11434`).
- Claude default model: `claude-haiku-4-5-20251001`.
- Groq default model: `llama-3.3-70b-versatile`.

## Notable details

- **Never throws.** All error paths return `null`, so a flaky AI provider
  never breaks the batch.
- **Ollama on a deployed origin** doesn't work — browsers block
  HTTPS → `http://localhost`. Useful only for local development.
- **No retries / refinement.** Single shot per row; if the model says
  "none" or hallucinates, the row stays uncategorized.
- **Bearer key over the wire.** API keys go from the browser → `/api/ai/*`
  → upstream. The Next route is the only place keys live in transit; not
  stored on the server.
- **Independent of [categorization rules](./categorization-rules.md)** — AI is
  the no-rule path; rules are the deterministic path. Both target the same
  column.
