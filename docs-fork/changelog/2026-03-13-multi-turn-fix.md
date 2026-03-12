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
| `packages/core/src/core/openaiContentGenerator.ts` | Pass `response_format: { type: 'json_object' }` when `responseMimeType === 'application/json'` |
| `packages/core/src/core/geminiChat.ts` | Remove `isGemini2Model` gate on `InvalidStreamError` retry + logging |
| `packages/core/src/core/client.ts` | Remove `isGemini2Model` gate on "Please continue." recovery |
| `packages/cli/src/ui/hooks/useGeminiStream.ts` | Show info message on `InvalidStream` instead of silent swallow |
| `packages/core/src/core/openaiContentGenerator.test.ts` | 2 new tests for `response_format` |
| `packages/core/src/core/geminiChat.test.ts` | Updated: retry now fires for all models |
| `packages/core/src/core/client.test.ts` | Updated: recovery now fires for all models |

## Details

- **nextSpeakerCheck** was disabled by default (`skipNextSpeakerCheck: true`). Flipped to `false` so the system auto-decides if the model should keep going after a tool result.
- **response_format** was missing from the OpenAI adapter's non-streaming path, causing JSON utility calls (nextSpeakerCheck, editCorrector) to fail silently.
- **Retry & recovery** for empty responses were gated behind `isGemini2Model()`. Removed the gate so all models benefit.
- **UI** silently swallowed `InvalidStream` events. Now shows "Model returned an empty response. Retrying...".
