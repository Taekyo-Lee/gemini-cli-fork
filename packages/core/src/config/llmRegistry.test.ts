/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'llmRegistry.test-fixture.json',
);

/**
 * Helper: reset the module cache, point _GEMINI_MODELS_PATH at the test
 * fixture, and dynamically re-import llmRegistry so it picks up fresh data.
 */
async function importFreshRegistry() {
  vi.resetModules();
  vi.stubEnv('_GEMINI_MODELS_PATH', FIXTURE_PATH);
  return await import('./llmRegistry.js');
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

// ── detectLocation ──────────────────────────────────────────────────────────

describe('detectLocation', () => {
  it('returns CORP for COMPANY env var', async () => {
    const { detectLocation } = await importFreshRegistry();
    vi.stubEnv('A2G_LOCATION', 'COMPANY');
    expect(detectLocation()).toBe('CORP');
  });

  it('returns CORP for PRODUCTION env var', async () => {
    const { detectLocation } = await importFreshRegistry();
    vi.stubEnv('A2G_LOCATION', 'PRODUCTION');
    expect(detectLocation()).toBe('CORP');
  });

  it('returns CORP for CORP env var', async () => {
    const { detectLocation } = await importFreshRegistry();
    vi.stubEnv('A2G_LOCATION', 'CORP');
    expect(detectLocation()).toBe('CORP');
  });

  it('returns DEV for DEVELOPMENT env var', async () => {
    const { detectLocation } = await importFreshRegistry();
    vi.stubEnv('A2G_LOCATION', 'DEVELOPMENT');
    expect(detectLocation()).toBe('DEV');
  });

  it('returns DEV for DEV env var', async () => {
    const { detectLocation } = await importFreshRegistry();
    vi.stubEnv('A2G_LOCATION', 'DEV');
    expect(detectLocation()).toBe('DEV');
  });

  it('returns HOME for HOME env var', async () => {
    const { detectLocation } = await importFreshRegistry();
    vi.stubEnv('A2G_LOCATION', 'HOME');
    expect(detectLocation()).toBe('HOME');
  });

  it('is case-insensitive', async () => {
    const { detectLocation } = await importFreshRegistry();
    vi.stubEnv('A2G_LOCATION', 'development');
    expect(detectLocation()).toBe('DEV');
  });

  it('defaults to HOME when no env var set', async () => {
    const { detectLocation } = await importFreshRegistry();
    vi.stubEnv('A2G_LOCATION', '');
    expect(detectLocation()).toBe('HOME');
  });
});

// ── getAvailableModels ──────────────────────────────────────────────────────

describe('getAvailableModels', () => {
  it('returns DEV models when in DEV environment', async () => {
    vi.stubEnv('A2G_LOCATION', 'DEVELOPMENT');
    const { getAvailableModels } = await importFreshRegistry();
    const models = getAvailableModels();
    const names = models.map((m) => m.model);
    expect(models.every((m) => m.dev)).toBe(true);
    expect(names).toContain('dev-TestModel');
    expect(names).toContain('shared-HomeDevModel');
    expect(names).not.toContain('corp-OnlyModel');
    expect(names).not.toContain('home-OnlyModel');
  });

  it('returns HOME models when in HOME environment', async () => {
    vi.stubEnv('A2G_LOCATION', 'HOME');
    const { getAvailableModels } = await importFreshRegistry();
    const models = getAvailableModels();
    const names = models.map((m) => m.model);
    expect(models.every((m) => m.home)).toBe(true);
    expect(names).toContain('home-OnlyModel');
    expect(names).toContain('shared-HomeDevModel');
    expect(names).not.toContain('corp-OnlyModel');
    expect(names).not.toContain('dev-TestModel');
  });

  it('returns CORP models when in CORP environment', async () => {
    vi.stubEnv('A2G_LOCATION', 'CORP');
    const { getAvailableModels } = await importFreshRegistry();
    const models = getAvailableModels();
    const names = models.map((m) => m.model);
    expect(names).toContain('corp-OnlyModel');
    expect(names).not.toContain('home-OnlyModel');
    expect(names).not.toContain('dev-TestModel');
  });

  it('returns empty list when no config file exists', async () => {
    vi.resetModules();
    vi.stubEnv('_GEMINI_MODELS_PATH', '/nonexistent/path/models.json');
    const { getAvailableModels } = await import('./llmRegistry.js');
    const models = getAvailableModels();
    expect(models).toEqual([]);
  });
});

// ── getModelByName ──────────────────────────────────────────────────────────

describe('getModelByName', () => {
  it('returns model config for a known model', async () => {
    const { getModelByName } = await importFreshRegistry();
    const model = getModelByName('dev-TestModel');
    expect(model).toBeDefined();
    expect(model!.modelAlias).toBe('dev-test');
    expect(model!.url).toBe('https://openrouter.ai/api/v1');
    expect(model!.apiKeyEnv).toBe('OPENROUTER_API_KEY');
  });

  it('returns undefined for an unknown model', async () => {
    const { getModelByName } = await importFreshRegistry();
    expect(getModelByName('nonexistent-model')).toBeUndefined();
  });

  it('returns correct config for models with extra fields', async () => {
    const { getModelByName } = await importFreshRegistry();
    const model = getModelByName('shared-HomeDevModel');
    expect(model).toBeDefined();
    expect(model!.url).toBe('https://api.openai.com/v1');
    expect(model!.supportsResponsesApi).toBe(true);
    expect(model!.reasoningModel).toBe(false);
    expect(model!.maxCompletionTokens).toBe(16384);
  });
});

// ── getAllModels ─────────────────────────────────────────────────────────────

describe('getAllModels', () => {
  it('returns all models regardless of environment', async () => {
    const { getAllModels } = await importFreshRegistry();
    const all = getAllModels();
    const names = all.map((m) => m.model);
    expect(names).toContain('corp-OnlyModel');
    expect(names).toContain('home-OnlyModel');
    expect(names).toContain('dev-TestModel');
    expect(names).toContain('shared-HomeDevModel');
    expect(all).toHaveLength(4);
  });
});
