# Reasoning Token Streaming — TODO (Gemini-fork)

Implementation checklist for displaying reasoning/thinking tokens from OpenAI-compatible reasoning models.

**Priority:** P0 = core streaming, P1 = completeness, P2 = nice-to-have
**Reference:** See [reasoning-streaming-plan.md](reasoning-streaming-plan.md) for architecture details.

**All P0 items implemented on 2026-04-07.**

---

## P0: Stream Reasoning Tokens (openaiContentGenerator.ts)

- [x] **Detect reasoning chunks in streaming** (2026-04-07)
  - File: `packages/core/src/core/openaiContentGenerator.ts`
  - Method: `streamToAsyncGenerator()`
  - Added `reasoningContent` extraction from `delta.reasoning` (with `delta.reasoning_content` fallback)
  - Key discovery: OpenRouter uses `delta.reasoning` (not `delta.reasoning_content`)

- [x] **Accumulate reasoning into single thought** (2026-04-07)
  - Added `pendingReasoning` buffer (like `pendingToolCalls` pattern)
  - Reasoning chunks are NOT yielded individually — buffered and flushed as ONE thought
  - Flush triggers: first `delta.content` chunk or `finish_reason`
  - New function `openaiReasoningToGeminiResponse()` in typeMapper creates consolidated response
  - Sanitizes `**` → `*` to prevent `parseThought()` from misinterpreting markdown bold as subject

- [x] **Add debug logging for reasoning chunks** (2026-04-07)
  - Logs `[OpenAI] Stream chunk: reasoning="..."` for each reasoning delta

---

## P0: Type Mapping (openaiTypeMapper.ts)

- [x] **Map reasoning to thought parts in streaming path** (2026-04-07)
  - File: `packages/core/src/core/openaiTypeMapper.ts`
  - Function: `openaiStreamChunkToGeminiResponse()` — per-chunk mapping (used for non-accumulated path)
  - Function: `openaiReasoningToGeminiResponse()` — consolidated thought from accumulated text
  - Maps to `Part` with `{ thought: true, text: content }`
  - Checks both `reasoning` and `reasoning_content` field names

- [x] **Map reasoning to thought parts in non-streaming path** (2026-04-07)
  - Function: `openaiResponseToGeminiResponse()`
  - Same mapping for complete (non-streaming) responses

---

## P0: UI Display

- [x] **Enable inline thinking by default** (2026-04-07)
  - File: `packages/cli/src/ui/utils/inlineThinkingMode.ts` — changed fallback to `'full'`
  - File: `packages/cli/src/config/settingsSchema.ts` — changed schema default from `'off'` to `'full'`
  - Note: Both needed because `settings.merged` uses schema defaults before code fallback triggers

---

## P0: Environment Variable Control

- [x] **Add `GEMINI_SHOW_REASONING` env var** (2026-04-07)
  - Default: `true` (reasoning displayed)
  - Set to `false` or `0` to hide reasoning output
  - Applied in both `openaiContentGenerator.ts` (streaming) and `openaiTypeMapper.ts` (non-streaming)
  - Documented in `.env.example` and `docs/fork/setup/environment-variables.md`

---

## P0: Verify End-to-End Flow

- [x] **Test with GLM-5** (`z-ai/glm-5` via OpenRouter) (2026-04-07)
  - "Thinking..." label appears with consolidated reasoning block
  - Single readable `ThinkingMessage` (not one line per chunk)
  - Final answer appears after reasoning completes
  - Debug log confirms reasoning chunks detected and accumulated

- [ ] **Test with non-reasoning model** (e.g., `gpt-4o-mini`)
  - No empty thought parts emitted
  - Existing behavior unchanged

---

## P0: Real-Time Streaming of Thinking (Phase 2)

Currently reasoning is accumulated and displayed all at once. Text streams via the
`pendingHistoryItem` pattern (rendered outside `<Static>`). Apply the same pattern to thinking.

**Approach:** Leverage the existing `pendingHistoryItem` infrastructure. Text already
streams in real-time via `setPendingHistoryItem()` → renders outside `<Static>` →
re-renders every frame. Apply the identical pattern with a `pendingThought` state.

**What we revert (Phase 1 manual implementation, replaced by infrastructure):**
- `openaiContentGenerator.ts`: Remove `pendingReasoning` buffer and accumulation logic
- `openaiContentGenerator.ts`: Remove `openaiReasoningToGeminiResponse()` call — yield chunks directly instead
- `handleThoughtEvent`: Remove `addItem()` call — use `setPendingThought()` instead

**What we keep (Phase 1, still needed):**
- `openaiStreamChunkToGeminiResponse()`: per-chunk reasoning→thought mapping (the data source)
- `openaiReasoningToGeminiResponse()`: keep for non-streaming path only
- `GEMINI_SHOW_REASONING` env var gate
- Debug logging for reasoning chunks
- `inlineThinkingMode` default change to `'full'`

**What we DON'T need to build (already exists):**
- `pendingHistoryItems` rendering outside `<Static>` (MainContent.tsx:128-173, 256-270)
- `ThinkingMessage` component (already renders thinking)
- `HistoryItemThinking` type (types.ts:277-280)
- `turn.ts` thought extraction from `part.thought` → `ServerGeminiThoughtEvent`
- `isFirstThinking` detection in MainContent.tsx

**What we add (wiring the infrastructure):**

- [x] **Revert accumulation in `openaiContentGenerator.ts`** (2026-04-07)
  - Removed `pendingReasoning` buffer and flush logic
  - Re-added `reasoningContent` to yield condition (chunks yield individually)
  - Removed `openaiReasoningToGeminiResponse` import and call
  - `GEMINI_SHOW_REASONING` env var gate moved to the yield condition

- [x] **Add `pendingThought` state in `useGeminiStream.ts`** (2026-04-07)
  - New state: `useStateAndRef<HistoryItemWithoutId | null>(null)`
  - Included in `pendingHistoryItems` array (before `pendingHistoryItem`)
  - Automatically renders outside `<Static>` via existing MainContent.tsx

- [x] **Modify `handleThoughtEvent` to use pending pattern** (2026-04-07)
  - Replaced `addItem()` with `setPendingThought()` — accumulates description text
  - Each thought event appends to pending item's description with space separator
  - Space separator needed because `parseThought()` trims each chunk, stripping leading spaces
  - `**` → `*` sanitization applied here (moved from `openaiReasoningToGeminiResponse`)

- [x] **Flush `pendingThought` when thinking ends** (2026-04-07)
  - In event loop, when non-Thought event arrives after thoughts
  - Moves `pendingThought` to permanent history via `addItem()`
  - Clears `pendingThought` state
  - Respects `inlineThinkingMode` setting

- [x] **Test real-time streaming with GLM-5** (2026-04-07)
  - Thinking text grows in real-time as chunks arrive
  - Single `ThinkingMessage` block that accumulates (not per-chunk lines)
  - Final answer follows after thinking completes
  - Verified with "Write a proof that there are infinitely many prime numbers"

---

## P1: Reasoning Token Counting

- [ ] **Extract reasoning token count from usage**
  - `completion_tokens_details.reasoning_tokens` in final usage chunk
  - Map to `usageMetadata.thoughtsTokenCount`

---

## P1: Telemetry (loggingContentGenerator.ts)

- [ ] **Add reasoning token count to telemetry**
  - File: `packages/core/src/core/loggingContentGenerator.ts`
  - Add `reasoning_tokens` attribute to span

---

## P2: Stats Display

- [ ] **Show reasoning tokens in stats footer**
  - File: `packages/cli/src/ui/utils/computeStats.ts`
  - File: `packages/cli/src/ui/components/StatsDisplay.tsx`
  - Display reasoning token count when > 0

---

## Key Discovery: Field Name

OpenRouter sends reasoning as `delta.reasoning` (not `delta.reasoning_content` as initially assumed).
The curl test revealed the actual format:
```json
{"choices":[{"delta":{"content":"","reasoning":"step by step...","reasoning_details":[...]}}]}
```

## Key Discovery: Settings Default

The `inlineThinkingMode` setting had `default: 'off'` in the schema (`settingsSchema.ts`).
The schema default populates `settings.merged.ui.inlineThinkingMode` BEFORE the code-level
fallback in `inlineThinkingMode.ts` can trigger. Both needed to be changed.

## Key Discovery: parseThought() Conflict

Reasoning models use `**bold**` markdown in their thinking output. Gemini's `parseThought()`
interprets the first `**...**` as a `**Subject**` delimiter, extracting random words (e.g., `r`
from `s-t-**r**-a-w`) as the header. Fixed by sanitizing `**` → `*` in accumulated reasoning.

---

## Files Modified

| Priority | File | Change |
|----------|------|--------|
| P0 | `packages/core/src/core/openaiContentGenerator.ts` | Accumulate reasoning, flush as single thought + env var gate |
| P0 | `packages/core/src/core/openaiTypeMapper.ts` | Map reasoning → Part.thought (both paths) + `openaiReasoningToGeminiResponse()` + env var gate |
| P0 | `packages/cli/src/ui/utils/inlineThinkingMode.ts` | Default to 'full' |
| P0 | `packages/cli/src/config/settingsSchema.ts` | Schema default to 'full' |
| P0 | `.env.example` | Added `GEMINI_SHOW_REASONING` |
| P0 | `docs/fork/setup/environment-variables.md` | Documented `GEMINI_SHOW_REASONING` |

## Files NOT Modified (already work)

| File | Why |
|------|-----|
| `packages/core/src/core/turn.ts` | Already extracts `part.thought` → `ServerGeminiThoughtEvent` |
| `packages/core/src/utils/thoughtUtils.ts` | Already parses thought format |
| `packages/cli/src/ui/components/messages/ThinkingMessage.tsx` | Already renders thinking |
| `packages/cli/src/ui/hooks/useGeminiStream.ts` | Already handles `handleThoughtEvent()` |
| `packages/cli/src/ui/types.ts` | Already defines `HistoryItemThinking` |
