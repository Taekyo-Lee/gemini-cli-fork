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
 * Tracks tool_call_id mappings for a single conversation/generator instance.
 * OpenAI requires tool_call_id on tool responses; Gemini uses name-based
 * matching. We generate stable IDs so round-tripping works.
 *
 * Previously this was module-level global state, which caused ID mismatches
 * when the same tool was called twice or multiple generators existed.
 */
export class ToolCallIdTracker {
  private readonly idMap = new Map<string, string>();
  private counter = 0;

  /** Maps sanitized OpenAI name → original Gemini name */
  private readonly nameMap = new Map<string, string>();

  getOrCreateId(name: string): string {
    const id = `call_${name}_${this.counter++}`;
    this.idMap.set(name, id);
    return id;
  }

  getLastId(name: string): string {
    return this.idMap.get(name) ?? `call_${name}_0`;
  }

  trackId(name: string, id: string): void {
    this.idMap.set(name, id);
  }

  /**
   * Sanitize a tool name for the OpenAI API which only allows [a-zA-Z0-9_-].
   * Gemini allows dots and colons. Stores the mapping for reverse lookup.
   */
  sanitizeName(geminiName: string): string {
    const openaiName = geminiName.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (openaiName !== geminiName) {
      this.nameMap.set(openaiName, geminiName);
    }
    return openaiName;
  }

  /** Restore original Gemini name from a sanitized OpenAI name. */
  restoreName(openaiName: string): string {
    return this.nameMap.get(openaiName) ?? openaiName;
  }
}

// ---------------------------------------------------------------------------
// Gemini -> OpenAI (requests)
// ---------------------------------------------------------------------------

function partsToText(parts: Part[]): string {
  return parts
    .filter(
      (p) => p.text !== undefined && !p.functionCall && !p.functionResponse,
    )
    .map((p) => p.text ?? '')
    .join('');
}

function partsFunctionCalls(
  parts: Part[],
  tracker: ToolCallIdTracker,
): ChatCompletionMessageToolCall[] {
  return parts
    .filter((p) => p.functionCall)
    .map((p) => {
      const fc = p.functionCall!;
      const name = tracker.sanitizeName(fc.name ?? 'unknown');
      const id = fc.id ?? tracker.getOrCreateId(name);
      return {
        id,
        type: 'function' as const,
        function: {
          name,
          arguments: JSON.stringify(fc.args ?? {}),
        },
      };
    });
}

export function geminiContentsToOpenAIMessages(
  contents: Content[],
  systemInstruction?: Content | string,
  tracker: ToolCallIdTracker = new ToolCallIdTracker(),
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
            tool_call_id: fr.id ?? tracker.getLastId(fr.name ?? 'unknown'),
            content: JSON.stringify(fr.response ?? {}),
          });
        }
      }
    } else if (role === 'model') {
      const toolCalls = partsFunctionCalls(parts, tracker);
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
            tool_call_id: fr.id ?? tracker.getLastId(fr.name ?? 'unknown'),
            content: JSON.stringify(fr.response ?? {}),
          });
        }
      }
    }
  }

  return messages;
}

/**
 * Gemini Schema uses uppercase type strings (e.g. "OBJECT", "STRING") while
 * OpenAI / JSON Schema expects lowercase ("object", "string").  Recursively
 * walk a schema object and lowercase any `type` field that matches.
 */
const GEMINI_TYPES = new Set([
  'TYPE_UNSPECIFIED',
  'STRING',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
  'NULL',
]);

function normalizeSchemaTypes(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(normalizeSchemaTypes);
  }
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- obj is a plain object at this point
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (
        key === 'type' &&
        typeof value === 'string' &&
        GEMINI_TYPES.has(value)
      ) {
        out[key] = value.toLowerCase();
      } else {
        out[key] = normalizeSchemaTypes(value);
      }
    }
    return out;
  }
  return obj;
}

export function geminiToolsToOpenAITools(
  tools?: Tool[],
  tracker?: ToolCallIdTracker,
): ChatCompletionTool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  const result: ChatCompletionTool[] = [];
  for (const tool of tools) {
    if (tool.functionDeclarations) {
      for (const fd of tool.functionDeclarations) {
        // Sanitize name: OpenAI only allows [a-zA-Z0-9_-], but Gemini
        // allows dots and colons.  The tracker stores the reverse mapping.
        const name = tracker
          ? tracker.sanitizeName(fd.name ?? '')
          : (fd.name ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');

        // Prefer parametersJsonSchema (standard JSON Schema, used by most
        // tools) over parameters (legacy Gemini Schema with uppercase types
        // like "OBJECT", "STRING").  Normalize any Gemini types to lowercase.
        const rawParams = fd.parametersJsonSchema ??
          fd.parameters ?? {
            type: 'object',
            properties: {},
          };

        result.push({
          type: 'function',
          function: {
            name,
            description: fd.description ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Schema objects are opaque JSON
            parameters: normalizeSchemaTypes(rawParams) as Record<
              string,
              unknown
            >,
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
  tracker: ToolCallIdTracker = new ToolCallIdTracker(),
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
      // Restore original Gemini name (may differ if dots/colons were sanitized)
      const originalName = tracker.restoreName(tc.function.name);
      parts.push({
        functionCall: {
          id: tc.id,
          name: originalName,
          args,
        },
      });
      // Track the ID using the original name for future tool responses
      tracker.trackId(originalName, tc.id);
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
  tracker: ToolCallIdTracker = new ToolCallIdTracker(),
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
            args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          }
        } catch {
          // Partial JSON during streaming — send what we have
        }
        // Restore original Gemini name (may differ if dots/colons were sanitized)
        const originalName = tracker.restoreName(tc.function.name);
        const id = tc.id ?? tracker.getOrCreateId(originalName);
        parts.push({
          functionCall: {
            id,
            name: originalName,
            args,
          },
        });
        if (tc.id) {
          tracker.trackId(originalName, tc.id);
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
