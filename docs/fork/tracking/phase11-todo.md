# Phase 11: Langfuse Telemetry — TODO

## Phase 11.1: TypeScript CLI — Config Layer

- [x] Add `otlpHeaders?: Record<string, string>` to `TelemetrySettings` interface
      (`packages/core/src/config/config.ts`)
- [x] Add `langfuse?: boolean` flag to `TelemetrySettings`
- [x] Add `getTelemetryOtlpHeaders()` and `getTelemetryLangfuse()` getters
      to `Config` class
- [x] Store `otlpHeaders` and `langfuse` from resolved settings in Config constructor

## Phase 11.2: TypeScript CLI — Langfuse Auto-Detection

- [x] Add Langfuse env var detection in `resolveTelemetrySettings()`
      (`packages/core/src/telemetry/config.ts`)
  - Read `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`
  - Build endpoint: `${baseUrl}/api/public/otel`
  - Build auth header: `Authorization: Basic base64(pk:sk)`
  - Auto-enable telemetry, set protocol to `http`
  - Explicit `GEMINI_TELEMETRY_*` vars take precedence

## Phase 11.3: TypeScript CLI — OTLP Exporters

- [x] Read `otlpHeaders` and `isLangfuse` from config in `initializeTelemetry()`
      (`packages/core/src/telemetry/sdk.ts`)
- [x] Pass `headers` to `OTLPTraceExporterHttp` and `OTLPMetricExporterHttp`
- [x] Use `NoopLogExporter` for Langfuse (doesn't support `/v1/logs`)
- [x] Add explicit `forceFlush()` before `sdk.shutdown()` for short-lived `-p` mode

## Phase 11.4: Langfuse Display Quality

- [x] Set `langfuse.observation.input` — LangChain-style `[{"type":"text","text":"..."}]`
      format, multimodality-ready (images → `{"type":"image_url",...}`)
- [x] Set `langfuse.observation.output` — same format, streaming chunks concatenated
      into single text entry
- [x] Set `langfuse.trace.name` + `langfuse.span.name` → `gemini-cli:{model}`
- [x] Helper functions in `loggingContentGenerator.ts`:
      `partsToLangChainFormat()`, `extractLastUserInput()`, `extractResponseOutput()`

## Phase 11.5: `-m` Flag Fix

- [x] `tryOpenAIAutoConnect()` now accepts `cliModelOverride` parameter
      (`packages/cli/src/core/openaiInitializer.ts`)
- [x] `initializeApp()` passes `argv.model` through
      (`packages/cli/src/core/initializer.ts`, `packages/cli/src/gemini.tsx`)
- [x] `-m` flag overrides saved model for OpenAI-compatible mode

## Phase 11.6: Documentation

- [x] Create `docs/fork/architecture/telemetry.md` — full telemetry docs
- [x] Update `docs/fork/architecture/openai-compatible.md` — cross-reference
- [x] Update `CLAUDE.md` — add Langfuse env vars, architecture table
- [x] Update `docs/fork/tracking/todo.md` — add Phase 11 entry

## Phase 11.7: Build & Test

- [x] File export test — 2542 lines of traces
- [x] Langfuse OTLP test — traces appear in Langfuse UI
- [x] `-m` flag test — correct model in trace
- [x] Langfuse display — Name, Input, Output match LangChain quality
- [x] Streaming output — chunks concatenated into single text entry

## Bug fixes discovered during Phase 11

- **`sdk.ts` file corruption**: Commit `db07a575b` overwrote `sdk.ts` with
  `config.ts` content. Restored from `fc899120f` and reapplied fork changes.
- **`-m` flag ignored in OpenAI mode**: `tryOpenAIAutoConnect()` only read
  saved model from settings, ignoring `argv.model`. Fixed by passing
  `cliModelOverride` parameter through `initializeApp()` → `tryOpenAIAutoConnect()`.
- **Langfuse `/v1/logs` 404**: Langfuse doesn't support the OTLP logs endpoint.
  Added `NoopLogExporter` to silence error spam.
- **Short-lived process flush**: Added explicit `spanProcessor.forceFlush()`
  before `sdk.shutdown()` to ensure HTTP exports complete for `gemini -p` mode.
- **Streaming output fragmentation**: Each streaming chunk created a separate
  `{"type":"text","text":"..."}` entry. Fixed by concatenating all text chunks
  into a single entry in `extractResponseOutput()`.
