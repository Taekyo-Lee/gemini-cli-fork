/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../../config/settings.js';

export type InlineThinkingMode = 'off' | 'full';

export function getInlineThinkingMode(
  settings: LoadedSettings,
): InlineThinkingMode {
  // [FORK] Default to 'full' so reasoning models (GLM-5, DeepSeek R1, QwQ, etc.)
  // display thinking tokens in real-time. Users can set to 'off' in settings.
  return settings.merged.ui?.inlineThinkingMode ?? 'full';
}
