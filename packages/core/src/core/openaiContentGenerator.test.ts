/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Type } from '@google/genai';
import type { LlmRole } from '../telemetry/llmRole.js';

// We need to capture the mock _before_ importing the module under test
const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

// Now import after mock is set up
const { OpenAIContentGenerator } = await import('./openaiContentGenerator.js');

describe('OpenAIContentGenerator', () => {
  let generator: InstanceType<typeof OpenAIContentGenerator>;
  const role = 'main' as LlmRole;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new OpenAIContentGenerator({
      baseURL: 'https://api.test.com/v1',
      apiKey: 'test-key',
      model: 'test-model',
    });
  });

  describe('generateContent', () => {
    it('sends correct request and returns Gemini-format response', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello from test model!',
              refusal: null,
            },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 6,
          total_tokens: 11,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await generator.generateContent(
        {
          model: 'ignored',
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        },
        'prompt-1',
        role,
      );

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates![0].content!.parts![0].text).toBe(
        'Hello from test model!',
      );
      expect(result.usageMetadata?.totalTokenCount).toBe(11);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'test-model',
          stream: false,
          messages: expect.arrayContaining([
            { role: 'user', content: 'Hello' },
          ]),
        }),
      );
    });

    it('includes tools when provided', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'ok', refusal: null },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await generator.generateContent(
        {
          model: 'ignored',
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
          config: {
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'test_fn',
                    description: 'A test function',
                    parameters: {
                      type: Type.OBJECT,
                      properties: { x: { type: Type.STRING } },
                    },
                  },
                ],
              },
            ],
          },
        },
        'prompt-2',
        role,
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              type: 'function',
              function: expect.objectContaining({ name: 'test_fn' }),
            }),
          ]),
        }),
      );
    });

    it('includes extraBody when configured', async () => {
      const genWithExtra = new OpenAIContentGenerator({
        baseURL: 'https://api.test.com/v1',
        apiKey: 'test-key',
        model: 'test-model',
        extraBody: { reasoning: { enabled: true } },
      });

      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'ok', refusal: null },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await genWithExtra.generateContent(
        {
          model: 'ignored',
          contents: 'Hello',
        },
        'prompt-3',
        role,
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: { enabled: true },
        }),
      );
    });

    it('handles string contents', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hi', refusal: null },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await generator.generateContent(
        { model: 'ignored', contents: 'Hello world' },
        'prompt-4',
        role,
      );

      expect(result.candidates).toHaveLength(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Hello world' }],
        }),
      );
    });
  });

  describe('countTokens', () => {
    it('returns heuristic token count', async () => {
      const result = await generator.countTokens({
        model: 'test-model',
        contents: [{ role: 'user', parts: [{ text: 'Hello world test' }] }],
      });
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(typeof result.totalTokens).toBe('number');
    });
  });

  describe('embedContent', () => {
    it('throws not supported error', async () => {
      await expect(
        generator.embedContent({
          model: 'test-model',
          contents: [{ role: 'user', parts: [{ text: 'test' }] }],
        }),
      ).rejects.toThrow('embedContent is not supported');
    });
  });

  describe('generateContentStream', () => {
    it('yields text chunks as Gemini responses', async () => {
      const chunks = [
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: { content: 'Hello' },
              finish_reason: null,
              logprobs: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: { content: ' world' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
        },
      ];

      async function* asyncChunks() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      mockCreate.mockResolvedValue(asyncChunks());

      const stream = await generator.generateContentStream(
        {
          model: 'ignored',
          contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        },
        'prompt-5',
        role,
      );

      const results = [];
      for await (const response of stream) {
        results.push(response);
      }

      expect(results.length).toBe(2);
      expect(results[0].candidates![0].content!.parts![0].text).toBe('Hello');
      expect(results[1].candidates![0].content!.parts![0].text).toBe(' world');
    });

    it('accumulates tool call fragments and emits on finish', async () => {
      const chunks = [
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'search', arguments: '{"q":' },
                  },
                ],
              },
              finish_reason: null,
              logprobs: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '"hello"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
              logprobs: null,
            },
          ],
        },
      ];

      async function* asyncChunks() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      mockCreate.mockResolvedValue(asyncChunks());

      const stream = await generator.generateContentStream(
        {
          model: 'ignored',
          contents: [{ role: 'user', parts: [{ text: 'search for hello' }] }],
        },
        'prompt-6',
        role,
      );

      const results = [];
      for await (const response of stream) {
        results.push(response);
      }

      // Only the final accumulated chunk should be yielded
      expect(results.length).toBe(1);
      const parts = results[0].candidates![0].content!.parts!;
      expect(parts).toHaveLength(1);
      expect(parts[0].functionCall!.name).toBe('search');
      expect(parts[0].functionCall!.id).toBe('call_1');
    });

    it('emits pending tool calls when finish_reason is stop instead of tool_calls', async () => {
      const chunks = [
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'read_file', arguments: '{"path":' },
                  },
                ],
              },
              finish_reason: null,
              logprobs: null,
            },
          ],
        },
        {
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '"/tmp/test.txt"}' },
                  },
                ],
              },
              // Some providers (OpenRouter, vLLM) return "stop" instead of "tool_calls"
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
        },
      ];

      async function* asyncChunks() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      mockCreate.mockResolvedValue(asyncChunks());

      const stream = await generator.generateContentStream(
        {
          model: 'ignored',
          contents: [{ role: 'user', parts: [{ text: 'read the file' }] }],
        },
        'prompt-stop-tool',
        role,
      );

      const results = [];
      for await (const response of stream) {
        results.push(response);
      }

      // Tool calls should still be emitted even with finish_reason "stop"
      expect(results.length).toBe(1);
      const parts = results[0].candidates![0].content!.parts!;
      expect(parts).toHaveLength(1);
      expect(parts[0].functionCall!.name).toBe('read_file');
      expect(parts[0].functionCall!.id).toBe('call_1');
    });

    it('requests stream with include_usage', async () => {
      async function* emptyStream() {
        // empty
      }

      mockCreate.mockResolvedValue(emptyStream());

      await generator.generateContentStream(
        {
          model: 'ignored',
          contents: 'Hi',
        },
        'prompt-7',
        role,
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          stream_options: { include_usage: true },
        }),
      );
    });
  });
});
