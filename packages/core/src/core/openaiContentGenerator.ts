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
  Part,
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
  ToolCallIdTracker,
} from './openaiTypeMapper.js';

export interface OpenAIContentGeneratorConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
  defaultHeaders?: Record<string, string>;
}

export class OpenAIContentGenerator implements ContentGenerator {
  private readonly client: OpenAI;
  private readonly modelName: string;
  private readonly extraBody?: Record<string, unknown>;
  private readonly maxTokens?: number;
  private readonly tracker = new ToolCallIdTracker();

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
    this.maxTokens = config.maxTokens;
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- systemInstruction type is wider than needed
      systemInstruction as Content | string | undefined,
      this.tracker,
    );
    const tools = geminiToolsToOpenAITools(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ToolListUnion includes CallableTool which we don't use
      request.config?.tools as Tool[] | undefined,
    );

    const response = await this.client.chat.completions.create({
      ...(this.extraBody && { ...this.extraBody }),
      model: this.modelName,
      messages,
      ...(tools && { tools }),
      ...(this.maxTokens && { max_tokens: this.maxTokens }),
      stream: false,
    });

    return openaiResponseToGeminiResponse(response, this.tracker);
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- systemInstruction type is wider than needed
      systemInstruction as Content | string | undefined,
      this.tracker,
    );
    const tools = geminiToolsToOpenAITools(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ToolListUnion includes CallableTool which we don't use
      request.config?.tools as Tool[] | undefined,
    );

    const stream = await this.client.chat.completions.create({
      ...(this.extraBody && { ...this.extraBody }),
      model: this.modelName,
      messages,
      ...(tools && { tools }),
      ...(this.maxTokens && { max_tokens: this.maxTokens }),
      stream: true,
      stream_options: { include_usage: true },
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
            yield openaiStreamChunkToGeminiResponse(
              completedChunk,
              this.tracker,
            );
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
        yield openaiStreamChunkToGeminiResponse(chunk, this.tracker);
      }
    }

    // Some providers (OpenRouter, vLLM) return finish_reason "stop" even when
    // tool calls are present. Emit any accumulated tool calls before ending.
    if (pendingToolCalls.size > 0) {
      const finalChunk: OpenAI.Chat.Completions.ChatCompletionChunk = {
        id: '',
        object: 'chat.completion.chunk',
        created: 0,
        model: this.modelName,
        choices: [
          {
            index: 0,
            delta: {
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
            finish_reason: 'tool_calls',
            logprobs: null,
          },
        ],
      };
      pendingToolCalls.clear();
      yield openaiStreamChunkToGeminiResponse(finalChunk, this.tracker);
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Heuristic: ~4 chars per token. Extract text from parts for a better
    // estimate instead of JSON.stringify which overestimates due to metadata.
    const contents = normalizeContents(request.contents);
    let text = '';
    for (const c of contents) {
      for (const p of c.parts ?? []) {
        if (p.text) text += p.text;
      }
    }
    const totalTokens = Math.ceil(text.length / 4) || 1;
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
    return contents.map((c): Content => {
      if (typeof c === 'string') {
        return { role: 'user', parts: [{ text: c }] };
      }
      if ('role' in c && 'parts' in c) {
        return c;
      }
      // PartUnion — cast needed because c is Part|Content but we know it's Part here
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return { role: 'user', parts: [c as Part] };
    });
  }
  if (typeof contents === 'string') {
    return [{ role: 'user', parts: [{ text: contents }] }];
  }
  if ('role' in contents && 'parts' in contents) {
    return [contents];
  }
  // Single PartUnion — cast needed because contents is Part|Content but we know it's Part here
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return [{ role: 'user', parts: [contents as Part] }];
}
