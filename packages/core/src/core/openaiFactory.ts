/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * [FORK] OpenAI-compatible content generator factory.
 *
 * Extracted from contentGenerator.ts to minimize fork changes in that
 * upstream-owned file.  All OpenAI/a2g_models logic lives here.
 */

import type { Config } from '../config/config.js';
import { getModelByName } from '../config/llmRegistry.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import type { ContentGenerator } from './contentGenerator.js';
import { type ContentGeneratorConfig, AuthType } from './contentGenerator.js';

/**
 * Detects whether the environment is configured for OpenAI-compatible mode.
 * Checks (in order): OPENAI_BASE_URL, PROJECT_OPENROUTER_API_KEY,
 * PROJECT_A2G_LOCATION.
 */
export function detectOpenAIMode(): boolean {
  return !!(
    process.env['OPENAI_BASE_URL'] ||
    process.env['PROJECT_OPENROUTER_API_KEY'] ||
    process.env['PROJECT_A2G_LOCATION']
  );
}

/**
 * Returns true if the given auth config is for OpenAI-compatible mode.
 * Used as an early-return guard in createContentGeneratorConfig().
 */
export function isOpenAIAuthConfig(authType: string | undefined): boolean {
  return authType === AuthType.OPENAI_COMPATIBLE;
}

/**
 * Creates an OpenAI-compatible ContentGenerator.
 *
 * Resolves model config from the a2g_models registry, sets up the API key
 * fallback chain, and wraps in LoggingContentGenerator.
 */
export function createOpenAIContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
): ContentGenerator {
  const selectedModelName =
    config.selectedOpenAIModel ?? gcConfig.getModel();
  const modelConfig = getModelByName(selectedModelName);
  const apiKeyEnv = modelConfig?.apiKeyEnv;
  const apiKey =
    (apiKeyEnv ? process.env[apiKeyEnv] : undefined) ??
    process.env['PROJECT_OPENAI_API_KEY'] ??
    process.env['OPENAI_API_KEY'] ??
    config.apiKey ??
    '';
  const baseURL =
    modelConfig?.url ?? config.baseUrl ?? 'https://api.openai.com/v1';
  const modelToSend =
    modelConfig?.modelAlias ?? modelConfig?.model ?? selectedModelName;

  // Don't pass maxTokens when it equals contextLength — in the a2g_models
  // registry, max_tokens is often set to the context window size (not a safe
  // output limit).  Passing it as max_tokens to the OpenAI API would reserve
  // the entire context for output, leaving no room for input.
  const safeMaxTokens =
    modelConfig?.maxTokens != null &&
    modelConfig.contextLength != null &&
    modelConfig.maxTokens >= modelConfig.contextLength
      ? undefined
      : modelConfig?.maxTokens;

  const generator = new OpenAIContentGenerator({
    baseURL,
    apiKey,
    model: modelToSend,
    maxTokens: safeMaxTokens,
    extraBody: modelConfig?.extraBody,
    defaultHeaders: modelConfig?.defaultHeaders,
  });
  return new LoggingContentGenerator(generator, gcConfig);
}
