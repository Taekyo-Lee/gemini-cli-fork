/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * [FORK] OpenAI-compatible model picker.
 *
 * Extracted from AuthDialog.tsx to minimize fork changes in that
 * upstream-owned file.  Shows available LLMs from the a2g_models registry
 * and connects via OpenAI Chat Completions API.
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import {
  AuthType,
  type Config,
  getAvailableModels,
} from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { AuthState } from '../types.js';

interface OpenAIModelPickerProps {
  config: Config;
  settings: LoadedSettings;
  setAuthState: (state: AuthState) => void;
  authError: string | null;
  onAuthError: (error: string | null) => void;
}

export function OpenAIModelPicker({
  config,
  settings,
  setAuthState,
  authError,
  onAuthError,
}: OpenAIModelPickerProps): React.JSX.Element {
  const [connecting, setConnecting] = useState(false);

  const models = getAvailableModels();
  const savedModel = settings.merged.security.auth.selectedModel;
  const items = models.map((m) => {
    const ctx =
      m.contextLength >= 1000000
        ? `${(m.contextLength / 1000000).toFixed(0)}M`
        : `${Math.round(m.contextLength / 1000)}K`;
    const tags = [ctx];
    if (m.reasoningModel) tags.push('reasoning');
    const detail = ` [${tags.join(', ')}]`;
    return {
      label: m.model + detail,
      value: m.model,
      key: m.model,
    };
  });
  const savedIndex = savedModel
    ? items.findIndex((i) => i.value === savedModel)
    : -1;

  const handleModelSelect = useCallback(
    (modelName: string) => {
      if (connecting) return;
      setConnecting(true);
      onAuthError(null);

      // Set the model on config and connect
      config.setModel(modelName, false);
      settings.setValue(
        SettingScope.User,
        'security.auth.selectedType',
        AuthType.OPENAI_COMPATIBLE,
      );
      settings.setValue(
        SettingScope.User,
        'security.auth.selectedModel',
        modelName,
      );

      config
        .refreshAuth(AuthType.OPENAI_COMPATIBLE)
        .then(() => {
          setAuthState(AuthState.Authenticated);
        })
        .catch((e: unknown) => {
          setConnecting(false);
          onAuthError(
            `Failed to connect: ${e instanceof Error ? e.message : String(e)}`,
          );
        });
    },
    [config, settings, setAuthState, onAuthError, connecting],
  );

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (authError) return true;
        onAuthError(
          'You must select a model to proceed. Press Ctrl+C twice to exit.',
        );
        return true;
      }
      return false;
    },
    { isActive: !connecting },
  );

  if (connecting) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.ui.focus}
        flexDirection="row"
        padding={1}
        width="100%"
        alignItems="flex-start"
      >
        <Text color={theme.text.primary}>Connecting to model...</Text>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.ui.focus}
      flexDirection="row"
      padding={1}
      width="100%"
      alignItems="flex-start"
    >
      <Text color={theme.text.accent}>? </Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color={theme.text.primary}>
          Select a model
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            {models.length} models available
          </Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={items}
            initialIndex={savedIndex >= 0 ? savedIndex : 0}
            onSelect={handleModelSelect}
            onHighlight={() => {
              onAuthError(null);
            }}
          />
        </Box>
        {authError && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>{authError}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>(Use Enter to select)</Text>
        </Box>
      </Box>
    </Box>
  );
}
