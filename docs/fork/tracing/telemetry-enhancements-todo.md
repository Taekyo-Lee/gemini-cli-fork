# Telemetry Enhancements: Backported from Claude-fork

After bringing Claude-fork's Langfuse tracing to parity with Gemini-fork (2026-04-07),
we found several attributes that Claude-fork had which Gemini-fork lacked.
These have been backported.

**All items implemented on 2026-04-07.**

**File modified:** `packages/core/src/core/loggingContentGenerator.ts`

---

## P1: Performance Metrics

- [x] **`ttft_ms` (Time to First Token)** — streaming path only
  - Captures time from request start to first streamed chunk
  - Tracked via `ttftMs` variable in `loggingStreamWrapper()`

- [x] **`duration_ms`** — both paths
  - Total request duration, set on success and error

---

## P1: Reliability Tracking

- [x] **`success` (boolean)** — both paths
  - `true` on success, `false` in catch block

- [ ] **`attempt` (number)** — deferred
  - Retry logic lives in `openaiContentGenerator.ts`, not in `loggingContentGenerator.ts`
  - Would need to thread attempt count through the content generator interface
  - Lower priority — deferring to future work

---

## P1: Tool Call Filtering

- [x] **`response.has_tool_call` (boolean)** — both paths
  - Checks `candidate.content.parts.some(p => p.functionCall)`

---

## P2: System Prompt Tracking

- [x] **`system_prompt_hash`** — both paths
  - SHA256 first 12 hex chars, prefixed with `sp_`
  - Added `shortHash()` helper using `crypto.createHash`

- [x] **`system_prompt_length`** — both paths
  - Character count of serialized system instruction

---

## P2: Compact Tool Summary

- [x] **`tools_count`** — both paths
  - Number of tools from `req.config.tools`

---

## P2: Query Source / Call Type

- [x] **`query_source`** — both paths
  - Set to `LlmRole` value (`main`, `subagent`, `utility_next_speaker`, etc.)
  - Enables filtering utility calls in Langfuse

---

## Summary of New Attributes

| Attribute | Non-streaming | Streaming | Error path |
|---|---|---|---|
| `duration_ms` | Yes | Yes | Yes |
| `ttft_ms` | N/A | Yes | N/A |
| `success` | Yes | Yes | Yes (false) |
| `query_source` | Yes | Yes | No |
| `response.has_tool_call` | Yes | Yes | No |
| `system_prompt_hash` | Yes | Yes | No |
| `system_prompt_length` | Yes | Yes | No |
| `tools_count` | Yes | Yes | No |
