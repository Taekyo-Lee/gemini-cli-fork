/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ContentGenerator implementation that talks to OpenAI-compatible APIs
 * (OpenRouter, on-prem vLLM, direct OpenAI, etc.).
 *
 * Accepts Gemini-format requests and returns Gemini-format responses by
 * delegating to the openaiTypeMapper for conversion.
 */

import OpenAI from 'openai';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Content,
  ContentListUnion,
  Tool,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import type { UserTierId, GeminiUserTier } from '../code_assist/types.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import {
  geminiContentsToOpenAIMessages,
  geminiToolsToOpenAITools,
  openaiResponseToGeminiResponse,
  openaiStreamChunkToGeminiResponse,
} from './openaiTypeMapper.js';

export interface OpenAIContentGeneratorConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  extraBody?: Record<string, unknown>;
  defaultHeaders?: Record<string, string>;
}

export class OpenAIContentGenerator implements ContentGenerator {
  private readonly client: OpenAI;
  private readonly modelName: string;
  private readonly extraBody?: Record<string, unknown>;

  userTier?: UserTierId;
  userTierName?: string;
  paidTier?: GeminiUserTier;

  constructor(config: OpenAIContentGeneratorConfig) {
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      defaultHeaders: config.defaultHeaders,
    });
    this.modelName = config.model;
    this.extraBody = config.extraBody;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const contents = normalizeContents(request.contents);
    const systemInstruction = request.config?.systemInstruction;
    const messages = geminiContentsToOpenAIMessages(
      contents,
      systemInstruction as Content | string | undefined,
    );
    const tools = geminiToolsToOpenAITools(request.config?.tools as Tool[] | undefined);

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages,
      ...(tools && { tools }),
      stream: false,
      ...(this.extraBody && { ...this.extraBody }),
    });

    return openaiResponseToGeminiResponse(response);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const contents = normalizeContents(request.contents);
    const systemInstruction = request.config?.systemInstruction;
    const messages = geminiContentsToOpenAIMessages(
      contents,
      systemInstruction as Content | string | undefined,
    );
    const tools = geminiToolsToOpenAITools(request.config?.tools as Tool[] | undefined);

    const stream = await this.client.chat.completions.create({
      model: this.modelName,
      messages,
      ...(tools && { tools }),
      stream: true,
      stream_options: { include_usage: true },
      ...(this.extraBody && { ...this.extraBody }),
    });

    return this.streamToAsyncGenerator(stream);
  }

  private async *streamToAsyncGenerator(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  ): AsyncGenerator<GenerateContentResponse> {
    // Accumulate tool call fragments across chunks
    const pendingToolCalls = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];

      // Accumulate tool call deltas
      if (choice?.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = pendingToolCalls.get(tc.index);
          if (existing) {
            existing.arguments += tc.function?.arguments ?? '';
          } else {
            pendingToolCalls.set(tc.index, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          }

          // If this chunk has a finish_reason, the tool calls are complete
          if (choice.finish_reason === 'tool_calls') {
            // Emit the accumulated tool calls as a single response
            const completedChunk = {
              ...chunk,
              choices: [
                {
                  ...choice,
                  delta: {
                    ...choice.delta,
                    tool_calls: Array.from(pendingToolCalls.entries()).map(
                      ([idx, tc]) => ({
                        index: idx,
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                          name: tc.name,
                          arguments: tc.arguments,
                        },
                      }),
                    ),
                  },
                },
              ],
            };
            pendingToolCalls.clear();
            yield openaiStreamChunkToGeminiResponse(completedChunk);
            continue;
          }

          // Don't yield partial tool call chunks — wait for completion
          continue;
        }
        // If we processed tool_calls but didn't yield (still accumulating), skip
        if (!choice.finish_reason) {
          continue;
        }
      }

      // For text content chunks, yield immediately
      if (choice?.delta?.content || !choice || chunk.usage) {
        yield openaiStreamChunkToGeminiResponse(chunk);
      }
    }

    // If there are still pending tool calls (e.g., finish_reason was 'stop' instead of 'tool_calls'),
    // this shouldn't normally happen but handle it gracefully
    if (pendingToolCalls.size > 0) {
      pendingToolCalls.clear();
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Heuristic: ~4 chars per token
    const text = JSON.stringify(request.contents);
    const totalTokens = Math.ceil(text.length / 4);
    return { totalTokens };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error(
      'embedContent is not supported for OpenAI-compatible models',
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeContents(contents: ContentListUnion): Content[] {
  if (Array.isArray(contents)) {
    return contents.map((c) => {
      if (typeof c === 'string') {
        return { role: 'user', parts: [{ text: c }] };
      }
      if ('role' in c && 'parts' in c) {
        return c as Content;
      }
      // PartUnion
      return { role: 'user', parts: [c] } as Content;
    });
  }
  if (typeof contents === 'string') {
    return [{ role: 'user', parts: [{ text: contents }] }];
  }
  if ('role' in contents && 'parts' in contents) {
    return [contents as Content];
  }
  // Single PartUnion
  return [{ role: 'user', parts: [contents] } as Content];
}
