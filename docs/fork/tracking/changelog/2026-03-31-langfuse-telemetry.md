# Phase 11: Langfuse Telemetry (On-Prem)

**Date:** 2026-03-31 **Phase:** 11

## Goal

Enable on-prem Langfuse telemetry for the gemini-cli fork. Coworkers set 3 env
vars and all LLM calls are traced in their self-hosted Langfuse instance. No
data leaves the corporate network.

## Changes

| File | Change |
|------|--------|
| `packages/core/src/config/config.ts` | Added `otlpHeaders`, `langfuse` to `TelemetrySettings`; added getters |
| `packages/core/src/telemetry/config.ts` | Langfuse auto-detection from `LANGFUSE_*` env vars; builds endpoint, auth header, auto-enables |
| `packages/core/src/telemetry/sdk.ts` | Pass headers to HTTP OTLP exporters; `NoopLogExporter` for Langfuse; explicit `forceFlush()` before shutdown |
| `packages/core/src/core/loggingContentGenerator.ts` | Langfuse display: `langfuse.observation.input/output` in LangChain-style format; `langfuse.trace.name/input/output`; streaming chunk concatenation |
| `packages/cli/src/core/openaiInitializer.ts` | `-m` flag override: `tryOpenAIAutoConnect()` accepts `cliModelOverride` |
| `packages/cli/src/core/initializer.ts` | Pass `cliModelOverride` through `initializeApp()` |
| `packages/cli/src/gemini.tsx` | Pass `argv.model` to `initializeApp()` |

## Documentation

| File | Content |
|------|---------|
| `docs/fork/tracing/telemetry.md` | Full telemetry docs (setup, config, data flow, troubleshooting) |
| `docs/fork/tracing/langfuse-trace-comparison.md` | Side-by-side comparison of LangChain vs gemini-fork traces with glossary and metadata key reference |

## Configuration

```bash
# Add to ~/.env — that's all
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3000
```

## Bug Fixes Discovered

- **`sdk.ts` file corruption** — commit `db07a575b` overwrote `sdk.ts` with
  `config.ts` content. Restored from `fc899120f`.
- **`-m` flag ignored in OpenAI mode** — `tryOpenAIAutoConnect()` only read
  saved model, ignoring CLI flag. Fixed.
- **Langfuse `/v1/logs` 404** — Langfuse doesn't support OTLP logs endpoint.
  Added `NoopLogExporter`.
- **Short-lived process flush** — `gemini -p` exited before HTTP export
  completed. Added explicit `forceFlush()` before shutdown.
- **Streaming output fragmentation** — each chunk was a separate JSON entry.
  Fixed by concatenating text in `extractResponseOutput()`.

## Trace Quality

| Field | Before | After |
|-------|--------|-------|
| Name | `llm call` | `gemini-cli:[OpenAI] gpt-4o-mini` |
| Input | `{"name":"uuid..."}` | `[{"type":"text","text":"안녕"}]` |
| Output | `{}` | `[{"type":"text","text":"안녕하세요! 어떻게 도와드릴까요?"}]` |

Format matches LangChain traces. Multimodality-ready (images → `{"type":"image_url",...}`).
