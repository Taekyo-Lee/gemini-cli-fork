/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { FinishReason, Type } from '@google/genai';
import type { Content, Tool } from '@google/genai';
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions';
import {
  geminiContentsToOpenAIMessages,
  geminiToolsToOpenAITools,
  openaiResponseToGeminiResponse,
  openaiStreamChunkToGeminiResponse,
  ToolCallIdTracker,
} from './openaiTypeMapper.js';

describe('geminiContentsToOpenAIMessages', () => {
  it('converts user text content', () => {
    const contents: Content[] = [{ role: 'user', parts: [{ text: 'Hello' }] }];
    const messages = geminiContentsToOpenAIMessages(contents);
    expect(messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('converts model text content to assistant', () => {
    const contents: Content[] = [
      { role: 'model', parts: [{ text: 'Hi there' }] },
    ];
    const messages = geminiContentsToOpenAIMessages(contents);
    expect(messages).toEqual([{ role: 'assistant', content: 'Hi there' }]);
  });

  it('adds system instruction from string', () => {
    const contents: Content[] = [{ role: 'user', parts: [{ text: 'Hello' }] }];
    const messages = geminiContentsToOpenAIMessages(
      contents,
      'You are a helpful assistant.',
    );
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('adds system instruction from Content object', () => {
    const contents: Content[] = [{ role: 'user', parts: [{ text: 'Hello' }] }];
    const systemContent: Content = {
      role: 'system',
      parts: [{ text: 'Be concise.' }],
    };
    const messages = geminiContentsToOpenAIMessages(contents, systemContent);
    expect(messages[0]).toEqual({ role: 'system', content: 'Be concise.' });
  });

  it('converts model function calls to assistant with tool_calls', () => {
    const contents: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'get_weather',
              args: { city: 'NYC' },
            },
          },
        ],
      },
    ];
    const messages = geminiContentsToOpenAIMessages(contents);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    const msg = messages[0] as {
      tool_calls: Array<{ function: { name: string; arguments: string } }>;
    };
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls[0].function.name).toBe('get_weather');
    expect(JSON.parse(msg.tool_calls[0].function.arguments)).toEqual({
      city: 'NYC',
    });
  });

  it('converts function responses to tool messages', () => {
    const contents: Content[] = [
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'get_weather',
              response: { temperature: 72 },
            },
          },
        ],
      },
    ];
    const messages = geminiContentsToOpenAIMessages(contents);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('tool');
    const msg = messages[0] as { content: string };
    expect(JSON.parse(msg.content)).toEqual({ temperature: 72 });
  });

  it('handles function role (legacy)', () => {
    const contents: Content[] = [
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'search',
              response: { results: [] },
            },
          },
        ],
      },
    ];
    const messages = geminiContentsToOpenAIMessages(contents);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('tool');
  });

  it('handles model with both text and function calls', () => {
    const contents: Content[] = [
      {
        role: 'model',
        parts: [
          { text: 'Let me check the weather.' },
          {
            functionCall: {
              name: 'get_weather',
              args: { city: 'NYC' },
            },
          },
        ],
      },
    ];
    const messages = geminiContentsToOpenAIMessages(contents);
    expect(messages).toHaveLength(1);
    const msg = messages[0] as {
      content: string | null;
      tool_calls: unknown[];
    };
    expect(msg.content).toBe('Let me check the weather.');
    expect(msg.tool_calls).toHaveLength(1);
  });

  it('skips empty text content', () => {
    const contents: Content[] = [{ role: 'user', parts: [] }];
    const messages = geminiContentsToOpenAIMessages(contents);
    expect(messages).toHaveLength(0);
  });
});

describe('geminiToolsToOpenAITools', () => {
  it('returns undefined for empty/missing tools', () => {
    expect(geminiToolsToOpenAITools(undefined)).toBeUndefined();
    expect(geminiToolsToOpenAITools([])).toBeUndefined();
  });

  it('converts function declarations to OpenAI tools', () => {
    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: 'get_weather',
            description: 'Gets the weather for a city',
            parameters: {
              type: Type.OBJECT,
              properties: {
                city: { type: Type.STRING },
              },
            },
          },
        ],
      },
    ];
    const result = geminiToolsToOpenAITools(tools);
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe('function');
    expect(result![0].function.name).toBe('get_weather');
    expect(result![0].function.description).toBe('Gets the weather for a city');
  });

  it('flattens multiple declarations from multiple tools', () => {
    const tools: Tool[] = [
      {
        functionDeclarations: [
          { name: 'fn1', description: 'd1' },
          { name: 'fn2', description: 'd2' },
        ],
      },
      {
        functionDeclarations: [{ name: 'fn3', description: 'd3' }],
      },
    ];
    const result = geminiToolsToOpenAITools(tools);
    expect(result).toHaveLength(3);
  });

  it('returns undefined for tools without function declarations', () => {
    const tools: Tool[] = [{}];
    expect(geminiToolsToOpenAITools(tools)).toBeUndefined();
  });

  it('sanitizes dots and colons in tool names for OpenAI API', () => {
    const tracker = new ToolCallIdTracker();
    const tools: Tool[] = [
      {
        functionDeclarations: [
          { name: 'server__tool.with.dots', description: 'has dots' },
          { name: 'ns:colon:tool', description: 'has colons' },
          { name: 'clean_name-ok', description: 'already valid' },
        ],
      },
    ];
    const result = geminiToolsToOpenAITools(tools, tracker);
    expect(result).toHaveLength(3);
    expect(result![0].function.name).toBe('server__tool_with_dots');
    expect(result![1].function.name).toBe('ns_colon_tool');
    expect(result![2].function.name).toBe('clean_name-ok');

    // Reverse mapping restores originals
    expect(tracker.restoreName('server__tool_with_dots')).toBe(
      'server__tool.with.dots',
    );
    expect(tracker.restoreName('ns_colon_tool')).toBe('ns:colon:tool');
    expect(tracker.restoreName('clean_name-ok')).toBe('clean_name-ok');
  });

  it('uses parametersJsonSchema when parameters is absent', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to read' },
      },
      required: ['file_path'],
    };
    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: 'read_file',
            description: 'Read a file',
            parametersJsonSchema: jsonSchema,
          },
        ],
      },
    ];
    const result = geminiToolsToOpenAITools(tools);
    expect(result).toHaveLength(1);
    const params = result![0].function.parameters as Record<string, unknown>;
    expect(params).toEqual(jsonSchema);
    expect(
      (params['properties'] as Record<string, unknown>)['file_path'],
    ).toBeDefined();
  });

  it('normalizes uppercase Gemini types to lowercase JSON Schema types', () => {
    const tools: Tool[] = [
      {
        functionDeclarations: [
          {
            name: 'complete_task',
            description: 'Complete the task',
            parameters: {
              type: Type.OBJECT,
              properties: {
                result: {
                  type: Type.STRING,
                  description: 'The result',
                },
              },
              required: ['result'],
            },
          },
        ],
      },
    ];
    const result = geminiToolsToOpenAITools(tools);
    expect(result).toHaveLength(1);
    const params = result![0].function.parameters as Record<string, unknown>;
    expect(params['type']).toBe('object');
    const props = params['properties'] as Record<
      string,
      Record<string, unknown>
    >;
    expect(props['result']['type']).toBe('string');
  });
});

describe('openaiResponseToGeminiResponse', () => {
  function makeChatCompletion(
    overrides: Partial<ChatCompletion> = {},
  ): ChatCompletion {
    return {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello!', refusal: null },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
      ...overrides,
    };
  }

  it('converts basic text response', () => {
    const response = makeChatCompletion();
    const result = openaiResponseToGeminiResponse(response);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates![0].content!.parts![0].text).toBe('Hello!');
    expect(result.candidates![0].content!.role).toBe('model');
    expect(result.candidates![0].finishReason).toBe(FinishReason.STOP);
  });

  it('maps usage metadata', () => {
    const response = makeChatCompletion();
    const result = openaiResponseToGeminiResponse(response);
    expect(result.usageMetadata?.promptTokenCount).toBe(10);
    expect(result.usageMetadata?.candidatesTokenCount).toBe(5);
    expect(result.usageMetadata?.totalTokenCount).toBe(15);
  });

  it('converts tool calls to function calls', () => {
    const response = makeChatCompletion({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            refusal: null,
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"NYC"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
          logprobs: null,
        },
      ],
    });
    const result = openaiResponseToGeminiResponse(response);
    const parts = result.candidates![0].content!.parts!;
    expect(parts).toHaveLength(1);
    expect(parts[0].functionCall!.name).toBe('get_weather');
    expect(parts[0].functionCall!.args).toEqual({ city: 'NYC' });
    expect(parts[0].functionCall!.id).toBe('call_abc');
  });

  it('handles empty choices', () => {
    const response = makeChatCompletion({ choices: [] });
    const result = openaiResponseToGeminiResponse(response);
    expect(result.candidates).toHaveLength(0);
  });

  it('maps finish reasons correctly', () => {
    const cases: Array<[string, FinishReason]> = [
      ['stop', FinishReason.STOP],
      ['length', FinishReason.MAX_TOKENS],
      ['content_filter', FinishReason.SAFETY],
      ['tool_calls', FinishReason.STOP],
      ['unknown_reason', FinishReason.OTHER],
    ];
    for (const [openaiReason, expected] of cases) {
      const response = makeChatCompletion({
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'x', refusal: null },
            finish_reason:
              openaiReason as ChatCompletion.Choice['finish_reason'],
            logprobs: null,
          },
        ],
      });
      const result = openaiResponseToGeminiResponse(response);
      expect(result.candidates![0].finishReason).toBe(expected);
    }
  });

  it('handles malformed tool call arguments gracefully', () => {
    const response = makeChatCompletion({
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            refusal: null,
            tool_calls: [
              {
                id: 'call_bad',
                type: 'function',
                function: {
                  name: 'broken_fn',
                  arguments: '{not valid json',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
          logprobs: null,
        },
      ],
    });
    const result = openaiResponseToGeminiResponse(response);
    const parts = result.candidates![0].content!.parts!;
    expect(parts[0].functionCall!.args).toEqual({});
  });
});

describe('openaiStreamChunkToGeminiResponse', () => {
  function makeChunk(
    overrides: Partial<ChatCompletionChunk> = {},
  ): ChatCompletionChunk {
    return {
      id: 'chatcmpl-stream-1',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          delta: { content: 'Hello' },
          finish_reason: null,
          logprobs: null,
        },
      ],
      ...overrides,
    };
  }

  it('converts text delta chunk', () => {
    const chunk = makeChunk();
    const result = openaiStreamChunkToGeminiResponse(chunk);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates![0].content!.parts![0].text).toBe('Hello');
  });

  it('handles empty choices (usage-only chunk)', () => {
    const chunk = makeChunk({
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const result = openaiStreamChunkToGeminiResponse(chunk);
    expect(result.candidates).toHaveLength(0);
    expect(result.usageMetadata?.promptTokenCount).toBe(10);
  });

  it('converts streaming tool calls', () => {
    const chunk = makeChunk({
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_stream_1',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{"q":"test"}',
                },
              },
            ],
          },
          finish_reason: null,
          logprobs: null,
        },
      ],
    });
    const result = openaiStreamChunkToGeminiResponse(chunk);
    const parts = result.candidates![0].content!.parts!;
    expect(parts).toHaveLength(1);
    expect(parts[0].functionCall!.name).toBe('search');
    expect(parts[0].functionCall!.id).toBe('call_stream_1');
  });

  it('maps finish_reason on stream chunk', () => {
    const chunk = makeChunk({
      choices: [
        {
          index: 0,
          delta: { content: 'done' },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
    });
    const result = openaiStreamChunkToGeminiResponse(chunk);
    expect(result.candidates![0].finishReason).toBe(FinishReason.STOP);
  });

  it('returns undefined finishReason when null', () => {
    const chunk = makeChunk();
    const result = openaiStreamChunkToGeminiResponse(chunk);
    expect(result.candidates![0].finishReason).toBeUndefined();
  });

  it('preserves model version', () => {
    const chunk = makeChunk({ model: 'deepseek-v3.2' });
    const result = openaiStreamChunkToGeminiResponse(chunk);
    expect(result.modelVersion).toBe('deepseek-v3.2');
  });
});
