# Phase 11: Langfuse Telemetry — TODO

## Phase 11.1: TypeScript CLI — Config Layer

- [x] Add `otlpHeaders?: Record<string, string>` to `TelemetrySettings` interface
      (`packages/core/src/config/config.ts`)
- [x] Add `getTelemetryOtlpHeaders(): Record<string, string> | undefined` getter
      to `Config` class
- [x] Store `otlpHeaders` from resolved settings in Config constructor

## Phase 11.2: TypeScript CLI — Langfuse Auto-Detection

- [x] Add Langfuse env var detection in `resolveTelemetrySettings()`
      (`packages/core/src/telemetry/config.ts`)
  - Read `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`
  - Build endpoint: `${baseUrl}/api/public/otel`
  - Build auth header: `Authorization: Basic base64(pk:sk)`
  - Auto-enable telemetry, set protocol to `http`
  - Explicit `GEMINI_TELEMETRY_*` vars take precedence

## Phase 11.3: TypeScript CLI — Pass Headers to OTLP Exporters

- [x] Read `otlpHeaders` from config in `initializeTelemetry()`
      (`packages/core/src/telemetry/sdk.ts`)
- [x] Pass `headers` to `OTLPTraceExporterHttp` constructor
- [x] Pass `headers` to `OTLPLogExporterHttp` constructor
- [x] Pass `headers` to `OTLPMetricExporterHttp` constructor (via its exporter)

## Phase 11.4: Documentation

- [x] Update `docs/fork/architecture/openai-compatible.md` — add Langfuse
      telemetry section
- [x] Update `CLAUDE.md` — add Langfuse env vars to env file section
- [x] Update `docs/fork/tracking/todo.md` — add Phase 11 entry

## Phase 11.5: Build & Test

- [ ] Rebuild: `npm run build`
- [ ] Test: Set `LANGFUSE_*` env vars, run `gemini`, check Langfuse UI for traces
- [ ] Test: Verify explicit `GEMINI_TELEMETRY_ENABLED=false` overrides Langfuse
- [ ] Test: Verify Python `CallbackHandler()` works with `from_model()`
