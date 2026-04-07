# Reasoning Token Streaming — Implementation Plan (Gemini-fork)

## Problem

Same issue as claude-fork: reasoning models emit `reasoning_content` in OpenAI streaming deltas,
but `openaiContentGenerator.ts` ignores this field. Users see no thinking output while the model
reasons.

## Key Insight

**The UI already works.** Gemini CLI natively supports thinking via `Part.thought`. The entire
pipeline from thought extraction (`turn.ts` line 310-318) to event emission (`ServerGeminiThoughtEvent`)
to UI rendering (`ThinkingMessage.tsx`) is already in place. We only need to bridge the OpenAI
streaming layer.

## OpenAI → Gemini Thought Mapping

```
OpenAI delta.reasoning_content  →  Gemini Part.thought = true + Part.text
```

The mapping is straightforward:
- OpenAI sends `{ delta: { reasoning_content: "thinking text" } }`
- Gemini expects `{ thought: true, text: "thinking text" }` in response parts
- `turn.ts` checks `if (part.thought)` and yields `ServerGeminiThoughtEvent`
- `useGeminiStream.ts` `handleThoughtEvent()` renders it via `ThinkingMessage.tsx`

## Architecture

```
OpenAI SSE stream
  └─ openaiContentGenerator.ts   ← FIX: accumulate reasoning_content, yield as thought parts
       └─ openaiTypeMapper.ts     ← FIX: map reasoning_content to Part.thought
            └─ turn.ts            ← ALREADY WORKS: extracts thought parts
                 └─ ThinkingMessage.tsx  ← ALREADY WORKS: renders thinking
```

## Implementation

### File 1: `packages/core/src/core/openaiContentGenerator.ts` (PRIMARY)

**What to change:** `streamToAsyncGenerator()` method (~lines 190-341).

Currently processes:
- `choice?.delta?.content` → yields as text response
- `choice?.delta?.tool_calls` → accumulates in `pendingToolCalls`

**Add:**
1. Track reasoning state: `let pendingReasoningContent = ''`
2. When `delta.reasoning_content` appears:
   - Accumulate into `pendingReasoningContent`
   - **Option A (chunk-by-chunk):** Yield each reasoning chunk as a response with `Part.thought`
   - **Option B (accumulated):** Wait until reasoning is done, yield full thought at once
   - **Recommended: Option A** — enables real-time streaming display

3. For Option A, yield reasoning chunks directly:
   ```typescript
   if (choice?.delta?.reasoning_content) {
     yield openaiReasoningChunkToGeminiResponse(chunk, this.tracker);
   }
   ```

4. Handle transition from reasoning to content (no special handling needed if yielding
   chunk-by-chunk — `turn.ts` handles mixed thought/text parts).

### File 2: `packages/core/src/core/openaiTypeMapper.ts` (MAPPING)

**What to change:**

1. `openaiStreamChunkToGeminiResponse()` (~lines 377-465):
   - Add handling for `delta.reasoning_content`
   - Map to `Part` with `{ thought: true, text: reasoning_content }`

2. `openaiResponseToGeminiResponse()` (~lines 305-375):
   - Check `choice.message.reasoning_content` for non-streaming path
   - Add thought part to response parts

3. Usage metadata (~lines 356-363):
   - Extract `completion_tokens_details.reasoning_tokens`
   - Map to `usageMetadata.thoughtsTokenCount`

**New function needed:**
```typescript
function openaiReasoningChunkToGeminiResponse(
  chunk: ChatCompletionChunk,
  tracker: ToolCallIdTracker
): GenerateContentResponse {
  // Similar to openaiStreamChunkToGeminiResponse but maps
  // delta.reasoning_content to Part with thought=true
}
```

Or modify the existing function to handle both `delta.content` and `delta.reasoning_content`.

### File 3: `packages/core/src/core/loggingContentGenerator.ts` (TELEMETRY)

**What to change:** Add reasoning token tracking.

- Extract `thoughtsTokenCount` from response metadata
- Add `reasoning_tokens` attribute to telemetry span
- Track in both streaming and non-streaming paths

## Existing Infrastructure (no changes needed)

| Component | File | Status |
|-----------|------|--------|
| Thought extraction from parts | `turn.ts` lines 310-318 | Checks `part.thought` |
| Thought parsing utility | `utils/thoughtUtils.ts` | `parseThought()` function |
| Thought event type | `turn.ts` lines 137-141 | `ServerGeminiThoughtEvent` |
| Stream event handler | `useGeminiStream.ts` lines 1010-1022 | `handleThoughtEvent()` |
| Thinking UI component | `ThinkingMessage.tsx` | Renders with styling |
| History item type | `types.ts` lines 277-280 | `HistoryItemThinking` |
| Inline thinking mode | Settings | 'off', 'compact', 'full' modes |

## Testing

1. **GLM-5** (`z-ai/glm-5`) via OpenRouter — reasoning model with tool support
2. **QwQ** — Qwen reasoning model
3. **Non-reasoning model** — verify no empty thought parts emitted
4. **Verify:** `ThinkingMessage` component renders during reasoning phase
5. **Verify:** `inlineThinkingMode` setting respected (off/compact/full)

## Comparison with Claude-fork

| Aspect | Claude-fork | Gemini-fork |
|--------|-------------|-------------|
| Thinking format | `ThinkingBlock` (type: 'thinking') | `Part` (thought: true) |
| UI component | `AssistantThinkingMessage.tsx` | `ThinkingMessage.tsx` |
| Stream adapter | `streamAdapter.ts` | `openaiContentGenerator.ts` + `openaiTypeMapper.ts` |
| Type mapper | `typeMapper.ts` | `openaiTypeMapper.ts` |
| Native support | Claude extended thinking | Gemini thought parts |
| Token field | Custom attribute | `usageMetadata.thoughtsTokenCount` |

Both need the same fix at the same layer — the OpenAI streaming bridge.

## Related

- [Reasoning TODO](reasoning-todo.md) — Implementation checklist
- Claude-fork plan: `/home/jetlee/workspace/claude-code-fork/docs/fork/reasoning/`
