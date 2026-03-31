/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * [FORK] OpenAI-compatible auto-connect logic.
 *
 * Extracted from initializer.ts to minimize fork changes in that
 * upstream-owned file.
 */

import {
  type Config,
  getModelByName,
  AuthType,
} from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';

/**
 * Tries to auto-connect to an OpenAI-compatible model.
 *
 * Priority: CLI -m flag > saved model from settings > show model picker.
 * Validates the model against the LLM registry and calls
 * `config.refreshAuth(OPENAI_COMPATIBLE)`.
 *
 * @returns true if auto-connect succeeded, false otherwise.
 */
export async function tryOpenAIAutoConnect(
  config: Config,
  settings: LoadedSettings,
  cliModelOverride?: string,
): Promise<boolean> {
  // [FORK] -m flag overrides the saved model
  const modelName =
    cliModelOverride || settings.merged.security.auth.selectedModel;
  if (modelName && getModelByName(modelName)) {
    try {
      config.setModel(modelName, false);
      await config.refreshAuth(AuthType.OPENAI_COMPATIBLE);
      return true;
    } catch {
      // Fall through to show model picker
    }
  }
  return false;
}
