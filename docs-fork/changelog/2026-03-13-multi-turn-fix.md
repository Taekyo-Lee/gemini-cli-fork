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
| `packages/core/src/core/client.ts` | Remove `isGemini2Model` gate on "Please continue." recovery |
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
- **Korean IME character drop (Phase 10.3)**: When typing Korean (or other IME-composed input), the last character was dropped on submit. The IME-committed character and Enter arrive in the same stdin `data` event. React `useReducer` dispatches the insert synchronously but `buffer.text` still returns stale state. Fixed by adding `latestLinesRef` (synced inside the reducer) and `getLatestText()` which reads directly from the ref. All `handleSubmit(buffer.text)` calls in `InputPrompt.tsx` now use `buffer.getLatestText()`.

