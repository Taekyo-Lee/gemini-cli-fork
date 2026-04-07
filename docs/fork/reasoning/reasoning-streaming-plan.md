# Reasoning Token Streaming — Implementation Plan (Gemini-fork)

## Problem (Phase 1 — SOLVED)

Same as claude-fork: reasoning models emit `delta.reasoning` but gemini-fork ignored it.

**Fixed on 2026-04-07:** Reasoning chunks are accumulated and yielded as a single consolidated
thought part. The `ThinkingMessage` renders the complete reasoning block.

## Problem (Phase 2 — CURRENT)

Reasoning tokens are displayed all at once after the thinking phase completes, NOT streamed
in real-time like the final answer text. The current approach explicitly accumulates all chunks
(`pendingReasoning` buffer in `openaiContentGenerator.ts`) and flushes once.

**Root cause:** Two-fold:
1. **Data layer:** `openaiContentGenerator.ts` buffers all reasoning and yields once at the end
2. **UI layer:** `handleThoughtEvent()` calls `addItem()` which adds to `<Static>` history
   (immutable items), not to the live-updating `pendingHistoryItem` rendered outside `<Static>`

## Architecture: How Text Streams in Real-Time

Text content uses the `pendingHistoryItem` pattern:
```
text chunk arrives
  → handleContentEvent()
  → setPendingHistoryItem({ type: 'gemini', text: accumulated })  ← RE-RENDERS
  → MainContent.tsx: renders pendingItems OUTSIDE <Static>        ← LIVE UPDATE
  → when streaming ends: addItem() moves to <Static> history      ← FINALIZE
```

`<Static>` items are frozen (never re-render). Only the `pendingItems` Box re-renders,
so only the current streaming message updates — no flickering of the entire history.

## Fix: Use `pendingThought` Pattern

Apply the same `pendingHistoryItem` pattern to thinking:

### Step 1: Data Layer — Yield Reasoning Chunks Individually

**File: `packages/core/src/core/openaiContentGenerator.ts`**

Revert the accumulation approach. Instead of buffering `pendingReasoning`, yield each
reasoning chunk immediately via `openaiStreamChunkToGeminiResponse()`. The UI layer
will handle accumulation.

### Step 2: UI Layer — Add `pendingThought` State

**File: `packages/cli/src/ui/hooks/useGeminiStream.ts`**

```typescript
// New state alongside pendingHistoryItem:
const [pendingThought, pendingThoughtRef, setPendingThought] =
  useStateAndRef<HistoryItemThinking | null>(null);
```

### Step 3: Modify `handleThoughtEvent` to Update Pending State

```typescript
const handleThoughtEvent = useCallback(
  (eventValue: ThoughtSummary, _userMessageTimestamp: number) => {
    setThought(eventValue);  // Keep status bar update

    if (getInlineThinkingMode(settings) === 'full') {
      // Accumulate into pending instead of addItem()
      setPendingThought(current => ({
        type: 'thinking',
        thought: {
          subject: '',
          description: (current?.thought.description ?? '') + '\n' + eventValue.description,
        },
      }));
    }
  },
  [settings, setThought, setPendingThought],
);
```

### Step 4: Include `pendingThought` in Pending Items

```typescript
const pendingHistoryItems = useMemo(
  () =>
    [pendingThought, pendingHistoryItem, ...pendingToolGroupItems].filter(
      (i): i is HistoryItemWithoutId => i !== undefined && i !== null,
    ),
  [pendingThought, pendingHistoryItem, pendingToolGroupItems],
);
```

### Step 5: Flush `pendingThought` When Thinking Ends

In the event loop, when a non-Thought event arrives after thoughts:
```typescript
if (
  event.type !== ServerGeminiEventType.Thought &&
  thoughtRef.current !== null
) {
  setThought(null);
  // Flush pending thought to permanent history
  if (pendingThoughtRef.current && getInlineThinkingMode(settings) === 'full') {
    addItem(pendingThoughtRef.current, userMessageTimestamp);
    setPendingThought(null);
  }
}
```

## Result

```
reasoning chunk arrives
  → turn.ts: yields ServerGeminiThoughtEvent
  → handleThoughtEvent(): setPendingThought(accumulated)     ← RE-RENDERS
  → MainContent.tsx: renders pendingThought OUTSIDE <Static> ← LIVE UPDATE
  → when text starts: addItem() moves to <Static> history    ← FINALIZE
```

## Key Files

| File | Role |
|------|------|
| `packages/core/src/core/openaiContentGenerator.ts` | Revert accumulation → yield chunks individually |
| `packages/cli/src/ui/hooks/useGeminiStream.ts` | Add `pendingThought` state, modify handlers |
| `packages/cli/src/ui/components/MainContent.tsx` | Already renders `pendingHistoryItems` outside `<Static>` |
| `packages/cli/src/ui/components/messages/ThinkingMessage.tsx` | Already renders thinking (no changes) |

## Related

- [Reasoning TODO](reasoning-todo.md) — Implementation checklist
- Claude-fork plan: `/home/jetlee/workspace/claude-code-fork/docs/fork/reasoning/`
