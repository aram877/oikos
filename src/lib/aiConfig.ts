'use client'

import { useState, useEffect } from 'react'

export type AiProvider = 'ollama' | 'claude'
export type ClaudeModel = 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-6'

export interface OllamaConfig {
  url:   string
  model: string
}

export interface ClaudeConfig {
  apiKey: string
  model:  ClaudeModel
}

export interface AiConfig {
  provider: AiProvider
  ollama:   OllamaConfig
  claude:   ClaudeConfig
}

export const DEFAULTS: AiConfig = {
  provider: 'ollama',
  ollama: {
    url:   process.env.NEXT_PUBLIC_OLLAMA_URL   ?? 'http://localhost:11434',
    model: process.env.NEXT_PUBLIC_OLLAMA_MODEL ?? 'gemma4:e4b',
  },
  claude: {
    apiKey: '',
    model:  'claude-haiku-4-5-20251001',
  },
}

const STORAGE_KEY = 'ai_config'

export function getAiConfig(): AiConfig {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    return {
      provider: parsed.provider ?? DEFAULTS.provider,
      ollama:   { ...DEFAULTS.ollama,  ...parsed.ollama  },
      claude:   { ...DEFAULTS.claude,  ...parsed.claude  },
    }
  } catch {
    return DEFAULTS
  }
}

export function setAiConfig(config: AiConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function useAiConfig(): { config: AiConfig; setConfig: (config: AiConfig) => void } {
  const [config, setConfigState] = useState<AiConfig>(DEFAULTS)

  useEffect(() => {
    setConfigState(getAiConfig())
  }, [])

  function setConfig(newConfig: AiConfig) {
    setAiConfig(newConfig)
    setConfigState(newConfig)
  }

  return { config, setConfig }
}
