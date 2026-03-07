/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';

export interface LLMModelConfig {
  model: string;
  modelAlias?: string;
  url: string;
  modality?: { input: string[]; output: string[] };
  apiKeyEnv?: string;
  contextLength: number;
  maxTokens: number;
  corp: boolean;
  home: boolean;
  dev: boolean;
  supportsResponsesApi: boolean;
  reasoningModel: boolean;
  extraBody?: Record<string, unknown>;
  defaultHeaders?: Record<string, string>;
}

export type EnvironmentType = 'CORP' | 'DEV' | 'HOME';

export function detectLocation(): EnvironmentType {
  const envLocation = (process.env['PROJECT_A2G_LOCATION'] ?? '').toUpperCase();

  if (['COMPANY', 'PRODUCTION', 'CORP'].includes(envLocation)) {
    return 'CORP';
  }
  if (['DEVELOPMENT', 'DEV'].includes(envLocation)) {
    return 'DEV';
  }
  if (envLocation === 'HOME') {
    return 'HOME';
  }

  try {
    const hostname = os.hostname().toLowerCase();
    if (['prod', 'company', 'server'].some((p) => hostname.includes(p))) {
      return 'CORP';
    }
  } catch {
    // ignore
  }

  return 'HOME';
}

// ---------------------------------------------------------------------------
// Corporate (on-prem) models
// ---------------------------------------------------------------------------
const corpModels: LLMModelConfig[] = [
  {
    model: 'GLM-5-Thinking',
    url: 'http://a2g.samsungds.net:7620/v1',
    modality: { input: ['text'], output: ['text'] },
    contextLength: 157000,
    maxTokens: 157000,
    supportsResponsesApi: false,
    corp: true,
    home: false,
    dev: false,
    reasoningModel: true,
  },
  {
    model: 'GLM-5-Non-Thinking',
    url: 'http://a2g.samsungds.net:7620/v1',
    modality: { input: ['text'], output: ['text'] },
    contextLength: 157000,
    maxTokens: 157000,
    supportsResponsesApi: false,
    corp: true,
    home: false,
    dev: false,
    reasoningModel: true,
  },
  {
    model: 'Kimi-K2.5-Thinking',
    url: 'http://a2g.samsungds.net:7620/v1',
    modality: { input: ['text', 'image', 'video'], output: ['text'] },
    contextLength: 262000,
    maxTokens: 262000,
    supportsResponsesApi: false,
    corp: true,
    home: false,
    dev: false,
    reasoningModel: true,
  },
  {
    model: 'Kimi-K2.5-Non-Thinking',
    url: 'http://a2g.samsungds.net:7620/v1',
    modality: { input: ['text', 'image', 'video'], output: ['text'] },
    contextLength: 262000,
    maxTokens: 262000,
    supportsResponsesApi: false,
    corp: true,
    home: false,
    dev: false,
    reasoningModel: true,
  },
  {
    model: 'Qwen3.5-35B-A3B',
    url: 'http://a2g.samsungds.net:7620/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 128000,
    maxTokens: 128000,
    supportsResponsesApi: false,
    corp: true,
    home: false,
    dev: false,
    reasoningModel: true,
  },
  {
    model: 'Qwen3.5-122B-A10B',
    url: 'http://a2g.samsungds.net:7620/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 262000,
    maxTokens: 262000,
    supportsResponsesApi: false,
    corp: true,
    home: false,
    dev: false,
    reasoningModel: true,
  },
  {
    model: 'gpt-oss-120b',
    url: 'http://a2g.samsungds.net:7620/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 262000,
    maxTokens: 262000,
    supportsResponsesApi: false,
    corp: true,
    home: false,
    dev: false,
    reasoningModel: true,
  },
  {
    model: 'GaussO-Owl-Ultra-Instruct',
    url: 'http://apigw.samsungds.net:8000/gausso/1/gauss_o/aiserving/gauss/o/v1',
    modality: { input: ['text'], output: ['text'] },
    contextLength: 128000,
    maxTokens: 128000,
    supportsResponsesApi: false,
    corp: true,
    home: false,
    dev: false,
    reasoningModel: false,
    // Headers are built lazily via getDefaultHeaders() — env vars may not be
    // set at module-load time.
    get defaultHeaders(): Record<string, string> {
      return {
        'x-dep-ticket':
          (process.env['PROJECT_FALLBACK_API_KEY_1'] ?? '/').split('/')[1] ??
          '',
        'Send-System-Name':
          (process.env['PROJECT_FALLBACK_API_KEY_1'] ?? '/').split('/')[0] ??
          '',
        'User-Id': process.env['PROJECT_AD_ID'] ?? '',
        'User-Type': 'AD_ID',
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Dev/Home models (OpenRouter)
// ---------------------------------------------------------------------------
const devModels: LLMModelConfig[] = [
  {
    model: 'dev-DeepSeek-V3.2',
    modelAlias: 'deepseek/deepseek-v3.2',
    url: 'https://openrouter.ai/api/v1',
    modality: { input: ['text'], output: ['text'] },
    apiKeyEnv: 'PROJECT_OPENROUTER_API_KEY',
    contextLength: 128000,
    maxTokens: 128000,
    supportsResponsesApi: false,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
    extraBody: {
      provider: { sort: 'throughput' },
      reasoning: { enabled: true },
    },
  },
  {
    model: 'dev-DeepSeek-V3.2-non-reasoning',
    modelAlias: 'deepseek/deepseek-v3.2',
    url: 'https://openrouter.ai/api/v1',
    modality: { input: ['text'], output: ['text'] },
    apiKeyEnv: 'PROJECT_OPENROUTER_API_KEY',
    contextLength: 128000,
    maxTokens: 128000,
    supportsResponsesApi: false,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: false,
    extraBody: {
      provider: { sort: 'throughput' },
      reasoning: { enabled: false },
    },
  },
  {
    model: 'dev-claude-haiku-4.5',
    modelAlias: 'anthropic/claude-haiku-4.5',
    url: 'https://openrouter.ai/api/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    apiKeyEnv: 'PROJECT_OPENROUTER_API_KEY',
    contextLength: 200000,
    maxTokens: 64000,
    supportsResponsesApi: false,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
  {
    model: 'dev-claude-haiku-4.5-generic',
    modelAlias: 'anthropic/claude-haiku-4.5',
    url: 'https://openrouter.ai/api/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    apiKeyEnv: 'PROJECT_OPENROUTER_API_KEY',
    contextLength: 200000,
    maxTokens: 64000,
    supportsResponsesApi: false,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
  {
    model: 'dev-Gemini-3.1-Pro-Preview',
    modelAlias: 'google/gemini-3.1-pro-preview',
    url: 'https://openrouter.ai/api/v1',
    modality: { input: ['text', 'image', 'audio', 'video'], output: ['text'] },
    apiKeyEnv: 'PROJECT_OPENROUTER_API_KEY',
    contextLength: 1000000,
    maxTokens: 64000,
    supportsResponsesApi: false,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
    extraBody: {
      provider: { sort: 'throughput' },
      reasoning: { enabled: true },
    },
  },
  {
    model: 'dev-Claude-Opus-4.6',
    modelAlias: 'anthropic/claude-opus-4.6',
    url: 'https://openrouter.ai/api/v1',
    modality: { input: ['text', 'image', 'audio', 'video'], output: ['text'] },
    apiKeyEnv: 'PROJECT_OPENROUTER_API_KEY',
    contextLength: 1000000,
    maxTokens: 128000,
    supportsResponsesApi: false,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
    extraBody: {
      provider: { sort: 'throughput' },
      reasoning: { enabled: true },
    },
  },
];

// ---------------------------------------------------------------------------
// Default models (OpenAI direct)
// ---------------------------------------------------------------------------
const defaultModels: LLMModelConfig[] = [
  {
    model: 'gpt-4o',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 128000,
    maxTokens: 16384,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: false,
  },
  {
    model: 'gpt-4o-mini',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 128000,
    maxTokens: 16384,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: false,
  },
  {
    model: 'gpt-4.1',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 1047576,
    maxTokens: 32768,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: false,
  },
  {
    model: 'gpt-4.1-mini',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 1047576,
    maxTokens: 32768,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: false,
  },
  {
    model: 'gpt-4.1-nano',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 1047576,
    maxTokens: 32768,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: false,
  },
  {
    model: 'o1',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 200000,
    maxTokens: 100000,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
  {
    model: 'o3-mini',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text'], output: ['text'] },
    contextLength: 128000,
    maxTokens: 100000,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
  {
    model: 'o4-mini',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 200000,
    maxTokens: 100000,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
  {
    model: 'gpt-5',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 400000,
    maxTokens: 128000,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
  {
    model: 'gpt-5-nano',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 400000,
    maxTokens: 128000,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
  {
    model: 'gpt-5-mini',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 400000,
    maxTokens: 128000,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
  {
    model: 'gpt-5.2',
    url: 'https://api.openai.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 400000,
    maxTokens: 128000,
    supportsResponsesApi: true,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
];

// ---------------------------------------------------------------------------
// Anthropic (custom class, not ChatOpenAI)
// ---------------------------------------------------------------------------
const anthropicModels: LLMModelConfig[] = [
  {
    model: 'claude-haiku-4.5',
    modelAlias: 'claude-haiku-4-5',
    url: 'https://api.anthropic.com/v1',
    modality: { input: ['text', 'image'], output: ['text'] },
    contextLength: 200000,
    maxTokens: 64000,
    supportsResponsesApi: false,
    corp: false,
    home: true,
    dev: true,
    reasoningModel: true,
  },
];

// ---------------------------------------------------------------------------
// Combined registry
// ---------------------------------------------------------------------------
const allModels: LLMModelConfig[] = [
  ...corpModels,
  ...devModels,
  ...defaultModels,
  ...anthropicModels,
];

const modelsByName = new Map<string, LLMModelConfig>(
  allModels.map((m) => [m.model, m]),
);

export function getAvailableModels(): LLMModelConfig[] {
  const env = detectLocation();
  const envKey: 'corp' | 'dev' | 'home' =
    env === 'CORP' ? 'corp' : env === 'DEV' ? 'dev' : 'home';
  return allModels.filter((m) => m[envKey]);
}

export function getModelByName(name: string): LLMModelConfig | undefined {
  return modelsByName.get(name);
}

export function getAllModels(): LLMModelConfig[] {
  return [...allModels];
}
