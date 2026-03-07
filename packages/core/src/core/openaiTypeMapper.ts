/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts between Gemini (@google/genai) and OpenAI types.
 *
 * Gemini types are the "native" format used throughout the Gemini CLI codebase.
 * This mapper translates to/from OpenAI Chat Completions API format.
 */

import type {
  Content,
  Part,
  Tool,
  GenerateContentResponse as GeminiResponse,
  Candidate,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { GenerateContentResponse, FinishReason } from '@google/genai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

// ---------------------------------------------------------------------------
// Tool call ID tracking
// ---------------------------------------------------------------------------

/**
 * Map from function call name+index to a deterministic tool_call_id.
 * OpenAI requires tool_call_id on tool responses; Gemini uses name-based
 * matching. We generate stable IDs so round-tripping works.
 */
const toolCallIdMap = new Map<string, string>();
let toolCallCounter = 0;

function getOrCreateToolCallId(name: string): string {
  const id = `call_${name}_${toolCallCounter++}`;
  toolCallIdMap.set(name, id);
  return id;
}

function getLastToolCallId(name: string): string {
  return toolCallIdMap.get(name) ?? `call_${name}_0`;
}

// ---------------------------------------------------------------------------
// Gemini -> OpenAI (requests)
// ---------------------------------------------------------------------------

function partsToText(parts: Part[]): string {
  return parts
    .filter((p) => p.text !== undefined && !p.functionCall && !p.functionResponse)
    .map((p) => p.text ?? '')
    .join('');
}

function partsFunctionCalls(parts: Part[]): ChatCompletionMessageToolCall[] {
  return parts
    .filter((p) => p.functionCall)
    .map((p) => {
      const fc = p.functionCall!;
      const id = fc.id ?? getOrCreateToolCallId(fc.name ?? 'unknown');
      return {
        id,
        type: 'function' as const,
        function: {
          name: fc.name ?? '',
          arguments: JSON.stringify(fc.args ?? {}),
        },
      };
    });
}

export function geminiContentsToOpenAIMessages(
  contents: Content[],
  systemInstruction?: Content | string,
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  // System instruction
  if (systemInstruction) {
    const text =
      typeof systemInstruction === 'string'
        ? systemInstruction
        : partsToText(systemInstruction.parts ?? []);
    if (text) {
      messages.push({ role: 'system', content: text });
    }
  }

  for (const content of contents) {
    const role = content.role ?? 'user';
    const parts = content.parts ?? [];

    if (role === 'user') {
      const text = partsToText(parts);
      if (text) {
        messages.push({ role: 'user', content: text });
      }
      // Also handle function responses from "user" role (Gemini puts them there)
      for (const part of parts) {
        if (part.functionResponse) {
          const fr = part.functionResponse;
          messages.push({
            role: 'tool',
            tool_call_id: fr.id ?? getLastToolCallId(fr.name ?? 'unknown'),
            content: JSON.stringify(fr.response ?? {}),
          });
        }
      }
    } else if (role === 'model') {
      const toolCalls = partsFunctionCalls(parts);
      const text = partsToText(parts);

      if (toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolCalls,
        });
      } else if (text) {
        messages.push({ role: 'assistant', content: text });
      }
    } else if (role === 'function') {
      // Legacy Gemini function response role
      for (const part of parts) {
        if (part.functionResponse) {
          const fr = part.functionResponse;
          messages.push({
            role: 'tool',
            tool_call_id: fr.id ?? getLastToolCallId(fr.name ?? 'unknown'),
            content: JSON.stringify(fr.response ?? {}),
          });
        }
      }
    }
  }

  return messages;
}

export function geminiToolsToOpenAITools(
  tools?: Tool[],
): ChatCompletionTool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  const result: ChatCompletionTool[] = [];
  for (const tool of tools) {
    if (tool.functionDeclarations) {
      for (const fd of tool.functionDeclarations) {
        result.push({
          type: 'function',
          function: {
            name: fd.name ?? '',
            description: fd.description ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Schema objects are opaque JSON
            parameters: (fd.parameters ?? {
              type: 'object',
              properties: {},
            }) as Record<string, unknown>,
          },
        });
      }
    }
  }

  return result.length > 0 ? result : undefined;
}

// ---------------------------------------------------------------------------
// OpenAI -> Gemini (responses)
// ---------------------------------------------------------------------------

export function openaiResponseToGeminiResponse(
  response: ChatCompletion,
): GeminiResponse {
  const choice = response.choices[0];
  if (!choice) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Object.setPrototypeOf returns any
    return Object.setPrototypeOf(
      { candidates: [] },
      GenerateContentResponse.prototype,
    );
  }

  const parts: Part[] = [];
  const msg = choice.message;

  if (msg.content) {
    parts.push({ text: msg.content });
  }

  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        // keep empty args
      }
      parts.push({
        functionCall: {
          id: tc.id,
          name: tc.function.name,
          args,
        },
      });
      // Track the ID for future tool responses
      toolCallIdMap.set(tc.function.name, tc.id);
    }
  }

  const finishReason = mapFinishReason(choice.finish_reason);

  const candidate: Candidate = {
    content: { parts, role: 'model' },
    index: 0,
    finishReason,
  };

  const usageMetadata: GenerateContentResponseUsageMetadata | undefined =
    response.usage
      ? {
          promptTokenCount: response.usage.prompt_tokens,
          candidatesTokenCount: response.usage.completion_tokens,
          totalTokenCount: response.usage.total_tokens,
        }
      : undefined;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Object.setPrototypeOf returns any
  return Object.setPrototypeOf(
    {
      candidates: [candidate],
      usageMetadata,
      modelVersion: response.model,
      responseId: response.id,
    },
    GenerateContentResponse.prototype,
  );
}

export function openaiStreamChunkToGeminiResponse(
  chunk: ChatCompletionChunk,
): GeminiResponse {
  const choice = chunk.choices[0];
  if (!choice) {
    // Usage-only chunk (some providers send usage in a final chunk with no choices)
    const usageMetadata: GenerateContentResponseUsageMetadata | undefined =
      chunk.usage
        ? {
            promptTokenCount: chunk.usage.prompt_tokens,
            candidatesTokenCount: chunk.usage.completion_tokens,
            totalTokenCount: chunk.usage.total_tokens,
          }
        : undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Object.setPrototypeOf returns any
    return Object.setPrototypeOf(
      { candidates: [], usageMetadata, modelVersion: chunk.model },
      GenerateContentResponse.prototype,
    );
  }

  const parts: Part[] = [];
  const delta = choice.delta;

  if (delta.content) {
    parts.push({ text: delta.content });
  }

  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      // Streaming tool calls come in fragments — accumulate arguments
      if (tc.function?.name) {
        let args: Record<string, unknown> = {};
        try {
          if (tc.function.arguments) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown
            args = JSON.parse(tc.function.arguments) as Record<
              string,
              unknown
            >;
          }
        } catch {
          // Partial JSON during streaming — send what we have
        }
        const id = tc.id ?? getOrCreateToolCallId(tc.function.name);
        parts.push({
          functionCall: {
            id,
            name: tc.function.name,
            args,
          },
        });
        if (tc.id) {
          toolCallIdMap.set(tc.function.name, tc.id);
        }
      }
    }
  }

  const finishReason = choice.finish_reason
    ? mapFinishReason(choice.finish_reason)
    : undefined;

  const candidate: Candidate = {
    content: { parts, role: 'model' },
    index: 0,
    finishReason,
  };

  const usageMetadata: GenerateContentResponseUsageMetadata | undefined =
    chunk.usage
      ? {
          promptTokenCount: chunk.usage.prompt_tokens,
          candidatesTokenCount: chunk.usage.completion_tokens,
          totalTokenCount: chunk.usage.total_tokens,
        }
      : undefined;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Object.setPrototypeOf returns any
  return Object.setPrototypeOf(
    {
      candidates: [candidate],
      usageMetadata,
      modelVersion: chunk.model,
      responseId: chunk.id,
    },
    GenerateContentResponse.prototype,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapFinishReason(
  reason: string | null | undefined,
): FinishReason | undefined {
  if (!reason) return undefined;
  switch (reason) {
    case 'stop':
      return FinishReason.STOP;
    case 'length':
      return FinishReason.MAX_TOKENS;
    case 'content_filter':
      return FinishReason.SAFETY;
    case 'tool_calls':
    case 'function_call':
      return FinishReason.STOP;
    default:
      return FinishReason.OTHER;
  }
}
