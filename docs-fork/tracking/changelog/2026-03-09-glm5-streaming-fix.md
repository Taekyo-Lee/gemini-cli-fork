# Phase 8: GLM-5 Streaming Tool Call Fix

**Date:** 2026-03-09 (approx)
**Phase:** 8

## Problem

vLLM/GLM-5 sends duplicate streaming tool call chunks with `tc.id` set on every chunk (non-standard behavior). The adapter was appending instead of replacing, producing garbled arguments.

## Changes

| File | Change |
|---|---|
| `packages/core/src/core/openaiContentGenerator.ts` | Replace (not append) when `tc.id` exists for same tool call index |
| `packages/core/src/core/openaiTypeMapper.ts` | `sanitizeToolCallArgs()` — extracts last valid JSON from garbled concatenated string |
| `scripts/test_glm5_tools.py` | Python test script for GLM-5 multi-turn tool calling |

## Details

Standard OpenAI streaming sends `tc.id` only on the first chunk, then appends argument fragments. GLM-5/vLLM sends `tc.id` on every chunk, so the fix detects this and replaces the accumulated arguments instead of appending.
