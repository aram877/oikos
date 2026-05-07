# AI Configuration

A per-user, per-device picker for the AI provider that powers
[auto-categorize](./auto-categorize.md) and the optional commentary in the
[analyst](./analyst.md). Three providers: **Ollama** (local), **Groq**
(free API), **Claude** (Anthropic).

## Files

| File | Purpose |
|------|---------|
| `src/lib/aiConfig.ts` | Types, defaults, `getAiConfig`, `setAiConfig`, `useAiConfig` hook. |
| `src/app/settings/_components/AiConfigSection.tsx` | Settings UI: tabbed provider picker, key/url/model fields. |

Persistence: `localStorage['ai_config']` (JSON). Per-device — does **not**
sync across browsers or members.

## Types

```ts
type AiProvider = 'ollama' | 'claude' | 'groq'

type ClaudeModel = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6'
type GroqModel   = 'llama-3.3-70b-versatile' | 'llama-3.1-8b-instant' | 'gemma2-9b-it'

interface OllamaConfig { url: string; model: string }
interface ClaudeConfig { apiKey: string; model: ClaudeModel }
interface GroqConfig   { apiKey: string; model: GroqModel }

interface AiConfig {
  provider: AiProvider
  ollama:   OllamaConfig
  claude:   ClaudeConfig
  groq:     GroqConfig
}
```

Defaults:

| Field | Value |
|-------|-------|
| `provider` | `'ollama'` |
| `ollama.url` | `process.env.NEXT_PUBLIC_OLLAMA_URL` ?? `'http://localhost:11434'` |
| `ollama.model` | `process.env.NEXT_PUBLIC_OLLAMA_MODEL` ?? `'gemma4:e4b'` |
| Claude / Groq keys | `''` (user must provide) |

## How it works

1. The Settings card renders three tabs (one per provider). Selecting a
   provider sets `config.provider`. Each tab shows the relevant fields:
   - **Ollama** — URL + model (free-text).
   - **Groq** — API key + model dropdown.
   - **Claude** — API key + model dropdown.
2. Save → `setAiConfig(config)` writes the JSON to `localStorage`.
3. Consumers (`analyzeWithAI`, `categorizeWithAI`) call `getAiConfig()` at
   call-time. They dispatch by `config.provider`:
   - **Ollama**: direct browser fetch to `{url}/api/generate`.
   - **Claude / Groq**: `POST` to `/api/ai/analyze` or `/api/ai/categorize`,
     passing the API key as `Authorization: Bearer <key>` and the model
     name as a header.

## Notable details

- **Localhost Ollama on a deployed origin doesn't work.** Browsers block
  HTTPS-page → `http://localhost` requests. The settings UI shows a warning.
- **API keys live in localStorage** in plaintext. Use scoped keys; rotate
  if a device is shared.
- **Server-side proxy for Claude / Groq.** The `/api/ai/*` routes forward
  the user's key to the upstream — keys are never persisted server-side.
- **`useAiConfig()`** hydrates from localStorage on mount to avoid SSR /
  CSR mismatch.
- **Defaults are safe.** Missing keys just disable that provider; the app
  never crashes.

## Permissions

`abilities.ai`. The Settings AI section is hidden if the user has
`ai_access = 'none'`. Children typically don't see it.
