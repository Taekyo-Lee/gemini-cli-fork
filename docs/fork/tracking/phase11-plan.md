# Phase 11: Langfuse Telemetry Integration — Plan

## Goal

Enable on-prem Langfuse telemetry for the gemini-cli fork. Coworkers just set
3 env vars (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`)
and all LLM calls are automatically traced in their self-hosted Langfuse instance.

No data ever leaves the corporate network.

## Context

### What already exists (upstream)

The upstream Gemini CLI has a full OpenTelemetry pipeline:

- **`LoggingContentGenerator`** wraps every `ContentGenerator` (including our
  `OpenAIContentGenerator`) and instruments all LLM calls with spans, logs, and
  metrics.
- **OTLP exporters** (gRPC and HTTP) are already implemented in `sdk.ts`.
- **Config resolution** supports `GEMINI_TELEMETRY_*` env vars, CLI args, and
  `~/.gemini/settings.json`.
- **Semantic conventions** — uses standard OpenTelemetry GenAI attributes
  (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, etc.) which Langfuse
  understands natively.

### What's missing

1. **Auth headers**: Langfuse OTLP endpoint requires
   `Authorization: Basic base64(pk:sk)` but the HTTP exporters don't pass
   custom headers.
2. **Protocol default**: Langfuse only supports HTTP (not gRPC), but upstream
   defaults to gRPC (port 4317).
3. **UX**: Coworkers shouldn't need to construct base64 auth strings or know
   about `OTEL_EXPORTER_OTLP_HEADERS`.

### Langfuse OTLP endpoint details

- Self-hosted endpoint: `http://<host>:3000/api/public/otel`
- Signal-specific: `/api/public/otel/v1/traces`, `/v1/logs`, `/v1/metrics`
- Auth: `Authorization: Basic base64(PUBLIC_KEY:SECRET_KEY)`
- Protocol: HTTP only (JSON or protobuf), **no gRPC support**
- Langfuse understands `gen_ai.*` OpenTelemetry semantic conventions

## Approach: Langfuse-aware auto-configuration

### Design principle

Detect `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` env vars. When found,
auto-configure the existing OTLP pipeline with the correct endpoint, protocol,
and auth headers. No new dependencies, no new exporter — just smart defaults
on top of the existing infrastructure.

### User experience (target)

```bash
# In ~/.env
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3000  # optional, this is the default

# That's it. Run gemini as usual — traces appear in Langfuse UI.
$ gemini
```

Explicit telemetry env vars (`GEMINI_TELEMETRY_*`) always take precedence over
the Langfuse auto-configuration. This means:
- `GEMINI_TELEMETRY_ENABLED=false` disables telemetry even with Langfuse vars set
- `GEMINI_TELEMETRY_OTLP_ENDPOINT=...` overrides the Langfuse endpoint
- `GEMINI_TELEMETRY_OTLP_PROTOCOL=grpc` overrides the Langfuse HTTP default

## Files to modify

### 1. `packages/core/src/config/config.ts`

- Add `otlpHeaders?: Record<string, string>` to `TelemetrySettings` interface
- Add `getTelemetryOtlpHeaders()` getter to `Config` class
- Store `otlpHeaders` from resolved settings in the constructor

### 2. `packages/core/src/telemetry/config.ts`

In `resolveTelemetrySettings()`:

- Read `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` from env
- If PK + SK are present:
  - `langfuseEndpoint = ${baseUrl}/api/public/otel`
  - `langfuseHeaders = { Authorization: "Basic " + base64(pk:sk) }`
  - `langfuseProtocol = 'http'`
  - `langfuseEnabled = true`
- Apply as fallback defaults (explicit GEMINI_TELEMETRY_* vars take precedence):
  - `enabled ?? langfuseEnabled`
  - `otlpEndpoint ?? langfuseEndpoint`
  - `otlpProtocol ?? langfuseProtocol`
  - `otlpHeaders: langfuseHeaders` (only if no explicit endpoint override)

### 3. `packages/core/src/telemetry/sdk.ts`

- Read `otlpHeaders` from config via `config.getTelemetryOtlpHeaders()`
- Pass `headers` option to all three HTTP OTLP exporters:
  ```typescript
  spanExporter = new OTLPTraceExporterHttp({
    url: buildUrl('v1/traces'),
    headers: otlpHeaders,   // <-- new
  });
  ```

### 4. Python side (`scripts/fork/gemini_llm.py`)

No code changes needed. LangChain's Langfuse callback works at invocation time:

```python
from langfuse.langchain import CallbackHandler
handler = CallbackHandler()  # auto-reads LANGFUSE_* env vars
llm = from_model("[OpenAI] gpt-5")
llm.invoke("Hello", config={"callbacks": [handler]})
```

### 5. Documentation

- Update `docs/fork/architecture/openai-compatible.md` — add Langfuse section
- Update `CLAUDE.md` — mention Langfuse env vars

## Precedence rules (explicit > auto)

```
GEMINI_TELEMETRY_ENABLED    > Langfuse auto-enable
GEMINI_TELEMETRY_OTLP_ENDPOINT > Langfuse auto-endpoint
GEMINI_TELEMETRY_OTLP_PROTOCOL > Langfuse auto-protocol (http)
OTEL_EXPORTER_OTLP_HEADERS > Langfuse auto-headers (via OTel SDK)
```

## What gets traced

Since `LoggingContentGenerator` already wraps our `OpenAIContentGenerator`,
the following are captured automatically:

- **LLM calls**: model, prompt, response, duration, token usage
- **Tool calls**: function name, arguments, result, duration
- **Errors**: API errors with status codes
- **Session**: model selection, auth type, tool config

All using standard OpenTelemetry GenAI semantic conventions that Langfuse
parses into its native trace/generation/span model.

## Non-goals

- No Langfuse SDK dependency (we use standard OTLP, not the Langfuse client)
- No changes to the core telemetry pipeline (just configuration)
- No Python code changes (LangChain callbacks are separate)
- No W&B or LangSmith integration (future work if needed)
