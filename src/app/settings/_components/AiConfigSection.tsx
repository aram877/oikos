'use client'

import { useState, useEffect } from 'react'
import { useAiConfig, type AiConfig, type AiProvider, type ClaudeModel } from '@/lib/aiConfig'
import { useAbilities } from '@/hooks/useAbilities'

const CLAUDE_MODELS: { value: ClaudeModel; label: string }[] = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (fast, cheap)' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet (balanced)' },
  { value: 'claude-opus-4-6',           label: 'Claude Opus (most capable)' },
]

export function AiConfigSection() {
  const { can, loading: abilitiesLoading } = useAbilities()
  const { config, setConfig } = useAiConfig()

  const [local,   setLocal]   = useState<AiConfig>(config)
  const [saved,   setSaved]   = useState(false)

  // Sync local form state when config loads from localStorage
  useEffect(() => {
    setLocal(config)
  }, [config])

  if (!abilitiesLoading && !can('ai', 'read')) return null

  function setProvider(provider: AiProvider) {
    setLocal(prev => ({ ...prev, provider }))
  }

  function save() {
    setConfig(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      {/* Provider toggle */}
      <div className="mb-4">
        <p className="mb-2 text-xs text-neutral-500">Provider</p>
        <div className="flex gap-1 rounded-lg border border-neutral-200 p-1 w-fit dark:border-neutral-700">
          {(['ollama', 'claude'] as AiProvider[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                local.provider === p
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              {p === 'ollama' ? 'Ollama' : 'Claude API'}
            </button>
          ))}
        </div>
      </div>

      {/* Ollama fields */}
      {local.provider === 'ollama' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">URL</label>
            <input
              type="text"
              value={local.ollama.url}
              onChange={e => setLocal(prev => ({ ...prev, ollama: { ...prev.ollama, url: e.target.value } }))}
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              placeholder="http://localhost:11434"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Model</label>
            <input
              type="text"
              value={local.ollama.model}
              onChange={e => setLocal(prev => ({ ...prev, ollama: { ...prev.ollama, model: e.target.value } }))}
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              placeholder="gemma4:e4b"
            />
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Make sure Ollama is running on your machine.
          </p>
        </div>
      )}

      {/* Claude fields */}
      {local.provider === 'claude' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">API Key</label>
            <input
              type="password"
              autoComplete="off"
              value={local.claude.apiKey}
              onChange={e => setLocal(prev => ({ ...prev, claude: { ...prev.claude, apiKey: e.target.value } }))}
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              placeholder="sk-ant-…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Model</label>
            <select
              value={local.claude.model}
              onChange={e => setLocal(prev => ({ ...prev, claude: { ...prev.claude, model: e.target.value as ClaudeModel } }))}
              className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              {CLAUDE_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">
            Stored in this browser only — never sent to or stored on the server.
          </p>
        </div>
      )}

      {/* Save */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          className="rounded bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Save
        </button>
        {saved && (
          <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
        )}
      </div>
    </div>
  )
}
