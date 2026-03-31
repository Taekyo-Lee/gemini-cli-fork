/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// [FORK] LLM model registry — loads models from models.default.json at repo root.
// Edit that file to add/remove models. Warns and returns empty list if not found.

import * as os from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const envLocation = (process.env['A2G_LOCATION'] ?? '').toUpperCase();

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
// JSON config loading
// ---------------------------------------------------------------------------

interface JsonModelEntry {
  model: string;
  modelAlias?: string;
  url: string;
  modality?: { input: string[]; output: string[] };
  apiKeyEnv?: string;
  contextLength: number;
  maxTokens: number;
  corp?: boolean;
  home?: boolean;
  dev?: boolean;
  supportsResponsesApi?: boolean;
  reasoningModel?: boolean;
  extraBody?: Record<string, unknown>;
  defaultHeaders?: string | Record<string, string>;
}

/** Build GaussO corp auth headers lazily from env vars. */
function buildCorpAuthHeaders(): Record<string, string> {
  return {
    'x-dep-ticket':
      (process.env['FALLBACK_API_KEY_1'] ?? '/').split('/')[1] ?? '',
    'Send-System-Name':
      (process.env['FALLBACK_API_KEY_1'] ?? '/').split('/')[0] ?? '',
    'User-Id': process.env['AD_ID'] ?? '',
    'User-Type': 'AD_ID',
  };
}

function parseModelsJson(jsonPath: string): LLMModelConfig[] | null {
  try {
    const raw = readFileSync(jsonPath, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown
    const data = JSON.parse(raw) as { models: JsonModelEntry[] };
    if (!Array.isArray(data.models)) return null;

    const models: LLMModelConfig[] = [];
    for (const entry of data.models) {
      // Skip section separator entries (e.g., { "_section": "--- OpenAI models ---" })
      if (!entry.model || !entry.url) continue;

      // Handle dynamic corp auth headers marker
      let defaultHeaders: Record<string, string> | undefined;
      if (entry.defaultHeaders === '__corp_auth__') {
        defaultHeaders = undefined; // handled via Object.defineProperty below
      } else if (
        typeof entry.defaultHeaders === 'object' &&
        entry.defaultHeaders !== null
      ) {
        defaultHeaders = entry.defaultHeaders;
      }

      const config: LLMModelConfig = {
        model: entry.model,
        url: entry.url,
        contextLength: entry.contextLength,
        maxTokens: entry.maxTokens ?? entry.contextLength,
        corp: entry.corp ?? false,
        home: entry.home ?? false,
        dev: entry.dev ?? false,
        supportsResponsesApi: entry.supportsResponsesApi ?? false,
        reasoningModel: entry.reasoningModel ?? false,
        ...(entry.modelAlias && { modelAlias: entry.modelAlias }),
        ...(entry.modality && { modality: entry.modality }),
        ...(entry.apiKeyEnv && { apiKeyEnv: entry.apiKeyEnv }),
        ...(entry.extraBody && { extraBody: entry.extraBody }),
        ...(defaultHeaders && { defaultHeaders }),
      };

      // For corp auth models, use a lazy getter so env vars are read at access time
      if (entry.defaultHeaders === '__corp_auth__') {
        Object.defineProperty(config, 'defaultHeaders', {
          get: buildCorpAuthHeaders,
          enumerable: true,
        });
      }

      models.push(config);
    }
    return models;
  } catch {
    return null;
  }
}

/** Resolve the path to the repo root's models.default.json. */
function getRepoDefaultPath(): string {
  // Walk up from this module's directory until we find models.default.json.
  // Works regardless of build output structure (dist/config/ vs dist/src/config/).
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'models.default.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return join(dir, 'models.default.json'); // won't exist, triggers fallback
}

function loadModels(): LLMModelConfig[] {
  const repoDefault =
    process.env['_GEMINI_MODELS_PATH'] ?? getRepoDefaultPath();
  if (existsSync(repoDefault)) {
    const models = parseModelsJson(repoDefault);
    if (models) {
      // Cache the resolved path so subprocesses skip the walk-up
      process.env['_GEMINI_MODELS_PATH'] = repoDefault;
      return models;
    }
  }

  // No models found — show guide once (env var survives subprocesses)
  if (!process.env['_GEMINI_NO_MODELS_WARNED']) {
    process.env['_GEMINI_NO_MODELS_WARNED'] = '1';
    process.stderr.write(
      '\n' +
        '⚠  No models loaded — models.default.json not found.\n' +
        '\n' +
        '   This file should exist at the root of your gemini-cli-fork repo.\n' +
        '   Rebuild and run from the repo, or re-link globally:\n' +
        '\n' +
        '     cd <your-repo-path>\n' +
        '     npm run build && node packages/cli\n' +
        '     # or: ./scripts/fork/link_global.sh\n\n',
    );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const allModels: LLMModelConfig[] = loadModels();

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
