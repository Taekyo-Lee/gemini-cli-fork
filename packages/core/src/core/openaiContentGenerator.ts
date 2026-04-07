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
  openaiReasoningToGeminiResponse,
  ToolCallIdTracker,
} from './openaiTypeMapper.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface OpenAIContentGeneratorConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  maxCompletionTokens?: number; // [FORK] Explicit max_completion_tokens (takes priority)
  extraBody?: Record<string, unknown>;
  defaultHeaders?: Record<string, string>;
}

export class OpenAIContentGenerator implements ContentGenerator {
  private readonly client: OpenAI;
  private readonly modelName: string;
  private readonly extraBody?: Record<string, unknown>;
  private readonly maxTokens?: number;
  private readonly maxCompletionTokens?: number;
  // [FORK] OpenAI's newer models (gpt-5, o1, o3, etc.) require
  // max_completion_tokens instead of max_tokens. Explicit config takes
  // priority; otherwise auto-detect from base URL.
  private readonly useMaxCompletionTokens: boolean;
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
    this.maxCompletionTokens = config.maxCompletionTokens;
    this.extraBody = config.extraBody;
    // Explicit maxCompletionTokens in model config takes priority,
    // otherwise auto-detect from URL (api.openai.com → max_completion_tokens)
    this.useMaxCompletionTokens =
      config.maxCompletionTokens != null ||
      config.baseURL.includes('api.openai.com');
  }

  // [FORK] Build the max tokens parameter based on provider/config.
  // 1. Explicit maxCompletionTokens → max_completion_tokens (highest priority)
  // 2. OpenAI API URL → max_completion_tokens with maxTokens value
  // 3. Everything else → max_tokens
  private get maxTokensParam(): Record<string, number> | undefined {
    if (this.maxCompletionTokens) {
      return { max_completion_tokens: this.maxCompletionTokens };
    }
    if (!this.maxTokens) return undefined;
    return this.useMaxCompletionTokens
      ? { max_completion_tokens: this.maxTokens }
      : { max_tokens: this.maxTokens };
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
      ...(this.maxTokensParam),
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
          `  [${msg.role}] tool_call_id=${msg.tool_call_id} content=${String(msg.content)}`,
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
        debugLogger.debug(`  [${msg.role}] ${content ?? ''}`);
      }
    }

    const stream = await this.client.chat.completions.create({
      ...(this.extraBody && { ...this.extraBody }),
      model: this.modelName,
      messages,
      ...(tools && { tools }),
      ...(this.maxTokensParam),
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
    // [FORK] Accumulate reasoning content across chunks (like pendingToolCalls).
    // Reasoning models send many small delta.reasoning chunks. We buffer them
    // and yield ONE consolidated thought part when reasoning ends, so the UI
    // renders a single readable ThinkingMessage instead of one line per chunk.
    let pendingReasoning = '';

    for await (const chunk of stream) {
      const choice = chunk.choices[0];

      // [FORK] Extract reasoning content for reasoning models (GLM-5, DeepSeek R1, QwQ, etc.)
      // OpenRouter sends "reasoning", some providers use "reasoning_content"
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- reasoning fields are not in OpenAI types yet
      const deltaAny = choice?.delta as unknown as Record<string, unknown> | undefined;
      const reasoningContent = (deltaAny?.['reasoning'] ?? deltaAny?.['reasoning_content']) as string | undefined;

      // Debug: log each chunk summary
      if (choice?.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          debugLogger.debug(
            `[OpenAI] Stream chunk: tool_call idx=${tc.index} id=${tc.id ?? '(none)'} name=${tc.function?.name ?? '(cont)'} args=${tc.function?.arguments ?? ''} finish=${choice.finish_reason ?? '(none)'}`,
          );
        }
      } else if (reasoningContent) {
        debugLogger.debug(
          `[OpenAI] Stream chunk: reasoning="${reasoningContent.substring(0, 80)}" finish=${choice?.finish_reason ?? '(none)'}`,
        );
      } else if (choice?.delta?.content) {
        debugLogger.debug(
          `[OpenAI] Stream chunk: text="${choice.delta.content}" finish=${choice.finish_reason ?? '(none)'}`,
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
            // Update id and name if provided (vLLM/GLM-5 sends these on every chunk)
            if (tc.id && !existing.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            // Always append arguments. GLM-5-Thinking sends incremental
            // fragments with tc.id on every chunk — replacing would lose
            // prior fragments. If a provider sends duplicate complete args
            // (original GLM-5 behavior), sanitizeToolCallArgs() extracts
            // the last valid JSON from the garbled concatenation.
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
            // Debug: log accumulated args before sanitization
            for (const [idx, pending] of pendingToolCalls.entries()) {
              debugLogger.debug(
                `[OpenAI] Emitting tool_call idx=${idx} name=${pending.name} args_len=${pending.arguments.length} args_preview="${pending.arguments.substring(0, 120)}"`,
              );
            }
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

      // [FORK] Accumulate reasoning content — don't yield individual chunks.
      // This buffers the full reasoning text and emits it as a single thought
      // part when reasoning ends (i.e., when text content or finish_reason arrives).
      // Controlled by GEMINI_SHOW_REASONING env var (default: true).
      const showReasoning = process.env['GEMINI_SHOW_REASONING'] !== 'false' && process.env['GEMINI_SHOW_REASONING'] !== '0';
      if (reasoningContent && showReasoning) {
        pendingReasoning += reasoningContent;
        // Don't yield yet — continue accumulating
        if (!choice?.finish_reason && !choice?.delta?.content) {
          continue;
        }
      }

      // [FORK] Flush accumulated reasoning as a single thought part before
      // yielding text content or finish. This produces one clean ThinkingMessage.
      if (pendingReasoning && (choice?.delta?.content || choice?.finish_reason)) {
        yield openaiReasoningToGeminiResponse(
          chunk,
          pendingReasoning,
          this.tracker,
        );
        pendingReasoning = '';
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
      for (const [idx, pending] of pendingToolCalls.entries()) {
        debugLogger.debug(
          `[OpenAI] Fallback emit tool_call idx=${idx} name=${pending.name} args_len=${pending.arguments.length} args_preview="${pending.arguments.substring(0, 120)}"`,
        );
      }
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
    // Garbled JSON from duplicate streaming chunks (e.g., vLLM/GLM-5 appending
    // the same complete args twice: `{"cmd":"x"}{"cmd":"x"}`).
    // Try each '{' from the end to find the last complete valid JSON object.
    let pos = args.length;
    while ((pos = args.lastIndexOf('{', pos - 1)) >= 0) {
      if (pos === 0) break; // position 0 is the whole string, already tried
      const candidate = args.substring(pos);
      try {
        JSON.parse(candidate);
        debugLogger.debug(
          `[OpenAI] Repaired garbled tool call args (len=${args.length}): extracted valid JSON at offset ${pos}`,
        );
        return candidate;
      } catch {
        continue;
      }
    }
    debugLogger.debug(
      `[OpenAI] Could not parse tool call args (len=${args.length}): "${args.substring(0, 200)}", using empty object`,
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
