# Phase 10: Multi-Turn Fix (Premature Stop + Silent Response)

**Date:** 2026-03-13
**Phase:** 10

## Problem

Two issues with KIMI and other OpenAI-compatible models:
1. **Premature stopping** — model stops after one tool call instead of continuing with sequential actions
2. **Silent response** — model sometimes returns nothing; repeating the message works

## Changes

| File | Change |
|---|---|
| `packages/core/src/config/config.ts` | Default `skipNextSpeakerCheck` to `false` (enables auto-continuation) |
| `packages/core/src/core/openaiContentGenerator.ts` | Pass `response_format: { type: 'json_object' }` when `responseMimeType === 'application/json'`; yield stop-only chunks so `finishReason` is captured |
| `packages/core/src/core/geminiChat.ts` | Remove `isGemini2Model` gate on `InvalidStreamError` retry + logging |
| `packages/core/src/core/client.ts` | Remove `isGemini2Model` gate on recovery; MAX_TOKENS auto-continue; null nextSpeakerCheck defaults to continue |
| `packages/core/src/core/contentGenerator.ts` | `safeMaxTokens` guard: skip `max_tokens` when `maxTokens >= contextLength` |
| `packages/cli/src/ui/hooks/useGeminiStream.ts` | Show info message on `InvalidStream` instead of silent swallow |
| `packages/core/src/core/openaiContentGenerator.test.ts` | 2 new tests for `response_format` |
| `packages/core/src/core/geminiChat.test.ts` | Updated: retry now fires for all models |
| `packages/core/src/core/client.test.ts` | Updated: recovery now fires for all models |

## Details

- **nextSpeakerCheck** was disabled by default (`skipNextSpeakerCheck: true`). Flipped to `false` so the system auto-decides if the model should keep going after a tool result.
- **nextSpeakerCheck guard (Phase 10.1)**: The check was firing for ALL text responses, causing infinite continuation loops on simple "Hello" messages. Added `isToolResponseTurn` guard in `client.ts` so `nextSpeakerCheck` only fires when the model is responding to tool results (`functionResponse` parts), not for text-only conversations.
- **response_format** was missing from the OpenAI adapter's non-streaming path, causing JSON utility calls (nextSpeakerCheck, editCorrector) to fail silently.
- **Stop chunk dropped (Phase 10.2)**: OpenAI streaming sends `finish_reason: 'stop'` in a separate chunk with no content. `streamToAsyncGenerator` was dropping this chunk, so `geminiChat` never saw the `finishReason` → threw `InvalidStreamError('NO_FINISH_REASON')` → triggered retry + "Please continue." recovery, causing the model to respond 4+ times to a single "Hello". Fixed by yielding finish-only chunks.
- **Retry & recovery** for empty responses were gated behind `isGemini2Model()`. Removed the gate so all models benefit.
- **UI** silently swallowed `InvalidStream` events. Now shows "Model returned an empty response. Retrying...".
- **Korean IME character drop (Phase 10.3)**: When typing Korean (or other IME-composed input), the last character was dropped on submit. Two root causes fixed:
  1. **Stdin char ordering**: Some terminals send `\r` (Enter) *before* the IME-committed character in a single `data` event (e.g. `"\r니"`). The submit fires before the character is inserted. Fixed by reordering `\r`/`\n` that precede non-ASCII characters in `createDataListener` so the IME char is processed first. Only non-ASCII chars (> U+007F) trigger reorder to avoid affecting normal paste text.
  2. **React state timing**: `useReducer` dispatch runs the reducer synchronously but the state binding is stale in the same tick. Fixed by adding `latestLinesRef` (synced inside the reducer) and `getLatestText()` which reads directly from the ref. All `handleSubmit(buffer.text)` calls in `InputPrompt.tsx` now use `buffer.getLatestText()`.
- **Premature stopping — null nextSpeakerCheck (Phase 10.4)**: The `checkNextSpeaker()` LLM call is fragile — when it fails (returns `null` due to timeout, malformed JSON, or network error), the system silently stopped the model, forcing users to say "keep going". Two fixes:
  1. **MAX_TOKENS auto-continue**: When `turn.finishReason` is `MAX_TOKENS`, bypass `checkNextSpeaker` entirely — the model was cut off mid-response and should always continue.
  2. **Null defaults to continue**: When `checkNextSpeaker` returns `null`, default to continuing instead of stopping. Safe due to `boundedTurns` limit (MAX_TURNS = 100).
- **GLM-5 max_tokens = contextLength (Phase 10.5)**: GLM-5 failed on first message with `API Error: 400 ... maximum input length of 248 tokens`. The a2g_models Python registry sets `max_tokens = context_length` for open-source LLMs (no distinct output limit) — the value represents the context window, not a safe output cap. The Python wrapper intentionally does NOT pass it to the API, but our TypeScript code was passing it directly as the OpenAI `max_tokens` parameter, telling vLLM to reserve 157,000 of 157,248 tokens for output. Fixed by adding a `safeMaxTokens` guard in `contentGenerator.ts`: when `maxTokens >= contextLength`, don't send `max_tokens` to the API.

