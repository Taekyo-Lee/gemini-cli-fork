/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IdeClient,
  IdeConnectionEvent,
  IdeConnectionType,
  logIdeConnection,
  type Config,
  StartSessionEvent,
  logCliConfiguration,
  startupProfiler,
  getAuthTypeFromEnv,
  AuthType,
} from '@google/gemini-cli-core';
// [FORK] OpenAI auto-connect extracted to its own module
import { tryOpenAIAutoConnect } from './openaiInitializer.js';
import { type LoadedSettings } from '../config/settings.js';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';
import type { AccountSuspensionInfo } from '../ui/contexts/UIStateContext.js';

export interface InitializationResult {
  authError: string | null;
  accountSuspensionInfo: AccountSuspensionInfo | null;
  themeError: string | null;
  shouldOpenAuthDialog: boolean;
  geminiMdFileCount: number;
}

/**
 * Orchestrates the application's startup initialization.
 * This runs BEFORE the React UI is rendered.
 * @param config The application config.
 * @param settings The loaded application settings.
 * @returns The results of the initialization.
 */
export async function initializeApp(
  config: Config,
  settings: LoadedSettings,
  cliModelOverride?: string,
): Promise<InitializationResult> {
  // [FORK] Check if OpenAI-compatible mode is detected from environment
  const isOpenAIMode = getAuthTypeFromEnv() === AuthType.OPENAI_COMPATIBLE;

  let authError: string | null = null;
  let accountSuspensionInfo: AccountSuspensionInfo | null = null;

  // [FORK] In OpenAI mode, try to auto-connect (-m flag overrides saved model)
  const openAIAutoConnected = isOpenAIMode
    ? await tryOpenAIAutoConnect(config, settings, cliModelOverride)
    : false;

  if (!isOpenAIMode) {
    const authHandle = startupProfiler.start('authenticate');
    const authResult = await performInitialAuth(
      config,
      settings.merged.security.auth.selectedType,
    );
    authError = authResult.authError;
    accountSuspensionInfo = authResult.accountSuspensionInfo;
    authHandle?.end();
  }

  const themeError = validateTheme(settings);

  // [FORK] In OpenAI mode, show model picker unless auto-connected to saved model
  const shouldOpenAuthDialog =
    (isOpenAIMode && !openAIAutoConnected) ||
    settings.merged.security.auth.selectedType === undefined ||
    !!authError;

  logCliConfiguration(
    config,
    new StartSessionEvent(config, config.getToolRegistry()),
  );

  if (config.getIdeMode()) {
    const ideClient = await IdeClient.getInstance();
    await ideClient.connect();
    logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.START));
  }

  return {
    authError,
    accountSuspensionInfo,
    themeError,
    shouldOpenAuthDialog,
    geminiMdFileCount: config.getGeminiMdFileCount(),
  };
}
