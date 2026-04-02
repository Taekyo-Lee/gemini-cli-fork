# GLM-5 Tool Calling Issues

GLM-5 (served via vLLM) has non-standard tool calling behavior that requires
special handling in our OpenAI-compatible adapter.

**Status (2026-04-02):** Both issues fixed and tested at company. GLM-5-Thinking
works for tool calling including complex nested arguments.

## Root Cause: Non-Standard Tool Call Format

GLM-5 was trained with a custom XML format for tool calls (see
[chat_template.jinja](./chat_template.jinja)):

```xml
<tool_call>function-name<arg_key>key1</arg_key><arg_value>value1</arg_value>...</tool_call>
```

This is **not** OpenAI's JSON-based format. vLLM parses this XML and converts it
to OpenAI streaming format, but the conversion introduces quirks:

- `tc.id` is set on **every** streaming chunk (OpenAI only sets it on the first)
- Arguments may arrive as fragments or as duplicate complete chunks
- Complex nested arguments (arrays of objects) are more prone to issues

## Issue 1: Duplicate Streaming Chunks (Phase 8 -- 2026-03)

**Symptom:** Simple tool calls like `run_command({"command": "date"})` produced
garbled JSON: `{"command":"date"}{"command":"date"}`.

**Root cause:** vLLM/GLM-5 sent duplicate complete tool call chunks with `tc.id`
set. Standard OpenAI append logic concatenated them into invalid JSON.

**Fix:** Replace instead of append when `tc.id` is present on the same index.
Added `sanitizeToolCallArgs()` to extract the last valid JSON object from garbled
concatenation.

**Test script:** `scripts/fork/test_glm5_tools.py` (written during Phase 8)

**Files changed:** `packages/core/src/core/openaiContentGenerator.ts`

## Issue 2: Complex Tool Call Arguments Lost (Phase 11 -- 2026-04)

**Symptom:** Simple tools (`ReadManyFiles`) worked fine. Complex tools
(`Ask User` with nested `questions` array) failed with
`params must have required property 'questions'` -- arguments arrived as `{}`.

**Context:** KIMI-2.5 was shut down by AI resource team on 2026-04-02. Replaced
by GLM-5-Thinking on the same vLLM endpoint.

**Root cause:** GLM-5-Thinking sends **incremental argument fragments** with
`tc.id` on every chunk. The Phase 8 "replace" logic discarded all prior
fragments on each new chunk, leaving only the last fragment.
`sanitizeToolCallArgs()` couldn't parse the fragment and returned `'{}'`.

**Why simple tools worked:** Small arguments (`{"patterns":["README.md"]}`) fit
in a single chunk. Large arguments (nested `questions` array) spanned many
chunks.

**Fix (openaiContentGenerator.ts):**

1. Changed to **always append** arguments regardless of `tc.id` presence
2. Improved `sanitizeToolCallArgs()` to try multiple `{` positions (not just the
   last one) for extracting valid JSON from duplicate concatenations
3. Added debug logging before emission (`args_len`, `args_preview`)

Both scenarios are now covered:
- **Fragments** (GLM-5-Thinking): append builds valid JSON directly
- **Duplicate complete chunks** (original GLM-5): append produces garbled JSON,
  `sanitizeToolCallArgs()` extracts the last valid object

## Debugging

### Enable debug logging

```bash
GEMINI_DEBUG_LOG_FILE=/tmp/gemini-debug.log gemini
```

### Inspect tool call streaming

```bash
grep "\[OpenAI\]" /tmp/gemini-debug.log
```

Expected output for a working tool call:

```
[DEBUG] [OpenAI] Stream chunk: tool_call idx=0 id=call_xxx name=ask_user args={"quest  finish=(none)
[DEBUG] [OpenAI] Stream chunk: tool_call idx=0 id=call_xxx name=(cont) args=ions":[   finish=(none)
...
[DEBUG] [OpenAI] Emitting tool_call idx=0 name=ask_user args_len=342 args_preview="{"questions":[{"question":"..."
```

If `args_len=0` or `args_preview="{}"`, arguments are not arriving from vLLM
(server-side issue).

### Test script (raw API)

```bash
set -a && source ~/.env && set +a
uv run scripts/fork/test_glm5_tools.py
```

## Key Files

| File | Role |
|------|------|
| `packages/core/src/core/openaiContentGenerator.ts` | Streaming chunk accumulation + `sanitizeToolCallArgs()` |
| `packages/core/src/core/openaiTypeMapper.ts` | `ToolCallIdTracker`, Gemini-OpenAI type conversion |
| `scripts/fork/test_glm5_tools.py` | Raw API test for GLM-5 tool calling |
| `docs/fork/debugging/glm5-tool-calling/chat_template.jinja` | GLM-5's native tool call format |

## References

- GLM-5 model: https://huggingface.co/zai-org/GLM-5
- vLLM OpenAI-compatible server: serves GLM-5 at `http://a2g.samsungds.net:7620/v1`
