/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectLocation,
  getAvailableModels,
  getModelByName,
  getAllModels,
} from './llmRegistry.js';

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('detectLocation', () => {
  it('returns CORP for COMPANY env var', () => {
    vi.stubEnv('A2G_LOCATION', 'COMPANY');
    expect(detectLocation()).toBe('CORP');
  });

  it('returns CORP for PRODUCTION env var', () => {
    vi.stubEnv('A2G_LOCATION', 'PRODUCTION');
    expect(detectLocation()).toBe('CORP');
  });

  it('returns CORP for CORP env var', () => {
    vi.stubEnv('A2G_LOCATION', 'CORP');
    expect(detectLocation()).toBe('CORP');
  });

  it('returns DEV for DEVELOPMENT env var', () => {
    vi.stubEnv('A2G_LOCATION', 'DEVELOPMENT');
    expect(detectLocation()).toBe('DEV');
  });

  it('returns DEV for DEV env var', () => {
    vi.stubEnv('A2G_LOCATION', 'DEV');
    expect(detectLocation()).toBe('DEV');
  });

  it('returns HOME for HOME env var', () => {
    vi.stubEnv('A2G_LOCATION', 'HOME');
    expect(detectLocation()).toBe('HOME');
  });

  it('is case-insensitive', () => {
    vi.stubEnv('A2G_LOCATION', 'development');
    expect(detectLocation()).toBe('DEV');
  });

  it('defaults to HOME when no env var set', () => {
    vi.stubEnv('A2G_LOCATION', '');
    expect(detectLocation()).toBe('HOME');
  });
});

describe('getAvailableModels', () => {
  it('returns DEV models when in DEV environment', () => {
    vi.stubEnv('A2G_LOCATION', 'DEVELOPMENT');
    const models = getAvailableModels();
    const names = models.map((m) => m.model);
    // All returned models must have dev=true
    expect(models.every((m) => m.dev)).toBe(true);
    expect(names).toContain('dev-DeepSeek-V3.2');
    expect(names).not.toContain('GLM-5-Thinking');
  });

  it('returns HOME models when in HOME environment', () => {
    vi.stubEnv('A2G_LOCATION', 'HOME');
    const models = getAvailableModels();
    const names = models.map((m) => m.model);
    // All returned models must have home=true
    expect(models.every((m) => m.home)).toBe(true);
    expect(names).toContain('dev-DeepSeek-V3.2');
    expect(names).not.toContain('GLM-5-Thinking');
  });

  it('returns CORP models when in CORP environment', () => {
    vi.stubEnv('A2G_LOCATION', 'CORP');
    const models = getAvailableModels();
    const names = models.map((m) => m.model);
    expect(names).toContain('GLM-5-Thinking');
    expect(names).toContain('Kimi-K2.5-Thinking');
    expect(names).not.toContain('dev-DeepSeek-V3.2');
    expect(names).not.toContain('gpt-4o');
  });
});

describe('getModelByName', () => {
  it('returns model config for a known model', () => {
    const model = getModelByName('dev-DeepSeek-V3.2');
    expect(model).toBeDefined();
    expect(model!.modelAlias).toBe('deepseek/deepseek-v3.2');
    expect(model!.url).toBe('https://openrouter.ai/api/v1');
    expect(model!.apiKeyEnv).toBe('OPENROUTER_API_KEY');
  });

  it('returns undefined for an unknown model', () => {
    expect(getModelByName('nonexistent-model')).toBeUndefined();
  });

  it('returns correct config for OpenAI models', () => {
    const model = getModelByName('gpt-4o');
    expect(model).toBeDefined();
    expect(model!.url).toBe('https://api.openai.com/v1');
    expect(model!.supportsResponsesApi).toBe(true);
    expect(model!.reasoningModel).toBe(false);
  });
});

describe('getAllModels', () => {
  it('returns all models regardless of environment', () => {
    const all = getAllModels();
    const names = all.map((m) => m.model);
    expect(names).toContain('GLM-5-Thinking');
    expect(names).toContain('dev-DeepSeek-V3.2');
    expect(names).toContain('gpt-4o');
    expect(names).toContain('claude-haiku-4.5');
  });
});
