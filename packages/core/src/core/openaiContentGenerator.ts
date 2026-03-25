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
import { debugLogger } from '../utils/debugLogger.js';

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
      this.tracker,
    );

    const response = await this.client.chat.completions.create({
      ...(this.extraBody && { ...this.extraBody }),
      model: this.modelName,
      messages,
      ...(tools && { tools }),
      ...(this.maxTokens && { max_tokens: this.maxTokens }),
      // Support JSON output for utility calls (nextSpeakerCheck, editCorrector, etc.)
      ...(request.config?.responseMimeType === 'application/json' && {
        response_format: { type: 'json_object' as const },
      }),
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
      this.tracker,
    );

    // Debug: log the exact messages being sent to the API
    debugLogger.debug(
      `[OpenAI] Sending ${messages.length} messages to ${this.modelName}:`,
    );
    for (const msg of messages) {
      if (msg.role === 'tool') {
        debugLogger.debug(
          `  [${msg.role}] tool_call_id=${msg.tool_call_id} content=${String(msg.content).substring(0, 200)}`,
        );
      } else if (
        msg.role === 'assistant' &&
        'tool_calls' in msg &&
        msg.tool_calls
      ) {
        debugLogger.debug(
          `  [${msg.role}] tool_calls=${JSON.stringify(msg.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name })))}`,
        );
      } else {
        const content =
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);
        debugLogger.debug(`  [${msg.role}] ${(content ?? '').substring(0, 100)}`);
      }
    }

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

      // Debug: log each chunk summary
      if (choice?.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          debugLogger.debug(
            `[OpenAI] Stream chunk: tool_call idx=${tc.index} id=${tc.id ?? '(none)'} name=${tc.function?.name ?? '(cont)'} args=${(tc.function?.arguments ?? '').substring(0, 100)} finish=${choice.finish_reason ?? '(none)'}`,
          );
        }
      } else if (choice?.delta?.content) {
        debugLogger.debug(
          `[OpenAI] Stream chunk: text="${choice.delta.content.substring(0, 80)}" finish=${choice.finish_reason ?? '(none)'}`,
        );
      } else if (choice?.finish_reason) {
        debugLogger.debug(
          `[OpenAI] Stream chunk: finish_reason=${choice.finish_reason}`,
        );
      }

      // Accumulate tool call deltas
      if (choice?.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = pendingToolCalls.get(tc.index);
          if (existing) {
            // If tc.id is set, some providers (vLLM/GLM-5) send a new
            // complete tool call on the same index — replace, don't append.
            if (tc.id) {
              existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              // Only replace arguments when the duplicate chunk has non-empty args.
              // GLM-5 sends a final confirmation chunk (same id, empty args) after
              // the streaming deltas — replacing with '' would erase accumulated args.
              if (tc.function?.arguments) {
                existing.arguments = tc.function.arguments;
              }
            } else {
              existing.arguments += tc.function?.arguments ?? '';
            }
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
                          arguments: sanitizeToolCallArgs(tc.arguments),
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

      // For text content chunks and finish-only chunks, yield immediately.
      // The finish-only chunk (finish_reason set, no content/tool_calls) must
      // be yielded so geminiChat captures the finishReason and avoids
      // throwing InvalidStreamError('NO_FINISH_REASON').
      if (
        choice?.delta?.content ||
        !choice ||
        chunk.usage ||
        (choice?.finish_reason && !choice?.delta?.tool_calls)
      ) {
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
                    arguments: sanitizeToolCallArgs(tc.arguments),
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

/**
 * Validates accumulated tool call arguments JSON. Some providers (vLLM with
 * GLM-5) send duplicate argument chunks during streaming, producing garbled
 * JSON like `{"command":"date"{"command": "date"}`. This function tries to
 * extract valid JSON, falling back to empty object.
 */
function sanitizeToolCallArgs(args: string): string {
  // Fast path: already valid
  try {
    JSON.parse(args);
    return args;
  } catch {
    // Try to find the last valid JSON object in the string
    const lastBrace = args.lastIndexOf('{');
    if (lastBrace > 0) {
      const candidate = args.substring(lastBrace);
      try {
        JSON.parse(candidate);
        debugLogger.debug(
          `[OpenAI] Repaired garbled tool call args: "${args}" → "${candidate}"`,
        );
        return candidate;
      } catch {
        // fall through
      }
    }
    debugLogger.debug(
      `[OpenAI] Could not parse tool call args: "${args}", using empty object`,
    );
    return '{}';
  }
}

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
