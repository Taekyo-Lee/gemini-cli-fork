# Phases 0–7: Initial Fork (Registry, Adapter, Auth, UI, Tests, Docs, Bug Fixes)

**Date:** 2026-03-06 (approx) **Phases:** 0–7

## Summary

Complete fork of Gemini CLI to support on-prem and OpenAI-compatible LLMs.

- **Phase 0** — Project setup, `scripts/test_openai_adapter.sh`, added `openai`
  dependency
- **Phase 1** — TypeScript LLM registry (`llmRegistry.ts`) mirroring Python
  `a2g_models` (27 models, 3 environments)
- **Phase 2** — `OpenAIContentGenerator` implementing `ContentGenerator`
  interface with streaming support
- **Phase 3** — `openaiTypeMapper.ts` for Gemini ↔ OpenAI type conversion
  (contents, tools, responses)
- **Phase 4** — Auth flow bypass: `OPENAI_COMPATIBLE` auth type, model picker
  instead of Google auth
- **Phase 5** — `OpenAIModelPicker` UI component (Ink/React) with env detection
  and model filtering
- **Phase 6** — Unit tests for all new modules
- **Phase 7** — Documentation (`docs/fork/`) + bug fixes (per-instance
  ToolCallIdTracker, streaming tool call emission, `validateAuthMethod`, corp
  headers, `max_tokens`, `extraBody` ordering, `countTokens`)

## Key Files Created

- `packages/core/src/config/llmRegistry.ts`
- `packages/core/src/core/openaiContentGenerator.ts`
- `packages/core/src/core/openaiTypeMapper.ts`
- `scripts/test_openai_adapter.sh`
