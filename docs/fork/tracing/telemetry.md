# Telemetry — Full Documentation

This document explains the telemetry infrastructure in Gemini CLI, how it
integrates with Langfuse for on-prem observability, and how to configure it.

## Overview

Gemini CLI has a production-grade **OpenTelemetry** observability pipeline built
into the upstream codebase. The fork adds **Langfuse auto-configuration** so that
coworkers can get full LLM tracing on a self-hosted Langfuse instance by setting
3 env vars — no data ever leaves the corporate network.

### Three Pillars

| Pillar | What it captures | OTel component |
|--------|-----------------|----------------|
| **Traces** | Spans for each LLM call, tool call, agent call | `BatchSpanProcessor` → OTLP exporter |
| **Logs** | Structured events (API request/response/error, tool execution, session) | `BatchLogRecordProcessor` → OTLP exporter |
| **Metrics** | Counters and histograms (token usage, latency, tool call counts) | `PeriodicExportingMetricReader` (10s interval) |

## Quick Start: Langfuse (On-Prem)

### Prerequisites

- Self-hosted Langfuse running in Docker (default port 3000)
- A Langfuse project with API keys (Settings → API Keys in the Langfuse UI)

### Setup

Add to `.env` (in the repo root):

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3000   # default if omitted
```

Run `gemini` as usual. Traces appear in the Langfuse UI automatically.

### How it works

```
┌─────────────────────────────────────────────────────┐
│  gemini CLI                                         │
│                                                     │
│  OpenAIContentGenerator                             │
│       ↓ (wrapped by)                                │
│  LoggingContentGenerator                            │
│       ↓ emits spans, logs, metrics                  │
│  OpenTelemetry SDK                                  │
│       ↓ batched, HTTP OTLP                          │
│  ┌─────────────────────────────────────┐            │
│  │ Authorization: Basic base64(pk:sk)  │            │
│  │ POST /api/public/otel/v1/traces     │            │
│  │ POST /api/public/otel/v1/logs       │            │
│  │ POST /api/public/otel/v1/metrics    │            │
│  └─────────────────────────────────────┘            │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (on-prem network only)
                       ▼
              ┌─────────────────┐
              │   Langfuse       │
              │   (Docker)       │
              │   :3000          │
              └─────────────────┘
```

1. `resolveTelemetrySettings()` detects `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`
2. Auto-configures:
   - Endpoint → `${LANGFUSE_BASE_URL}/api/public/otel`
   - Protocol → HTTP (Langfuse doesn't support gRPC)
   - Auth → `Authorization: Basic base64(pk:sk)`
   - Telemetry → auto-enabled
3. `LoggingContentGenerator` already wraps `OpenAIContentGenerator` (done in
   `openaiFactory.ts`), so every LLM call generates OpenTelemetry spans
4. Langfuse parses standard `gen_ai.*` semantic conventions into its native
   trace/generation/span UI

## What Gets Traced

### LLM Calls

Every `generateContent()` and `generateContentStream()` call is wrapped in an
OpenTelemetry span by `LoggingContentGenerator`. Each span includes:

| Attribute | OTel Key | Description |
|-----------|----------|-------------|
| Model | `gen_ai.request.model` | Model name (e.g., `gpt-5`, `GLM-5-Thinking`) |
| Prompt ID | `gen_ai.prompt.name` | Identifies the prompt turn |
| System instructions | `gen_ai.system_instructions` | System prompt (JSON) |
| Tool definitions | `gen_ai.tool.definitions` | Available tools (JSON) |
| Input tokens | `gen_ai.usage.input_tokens` | Prompt token count |
| Output tokens | `gen_ai.usage.output_tokens` | Completion token count |
| Input messages | `gen_ai.input.messages` | Conversation history (JSON, up to 160KB) |
| Output messages | `gen_ai.output.messages` | Model response (JSON) |
| Operation | `gen_ai.operation.name` | `llm_call` |
| Agent | `gen_ai.agent.name` | `gemini-cli` |
| Session | `gen_ai.conversation.id` | Session ID |

### Structured Events (Logs)

| Event | When emitted | Key data |
|-------|-------------|----------|
| `ApiRequestEvent` | Before each LLM call | Model, prompt, contents, config |
| `ApiResponseEvent` | After each LLM call | Duration, token usage, candidates, context breakdown |
| `ApiErrorEvent` | On LLM call failure | Error message, type, HTTP status |
| `ToolCallEvent` | After tool execution | Tool name, duration, success, lines changed |
| `UserPromptEvent` | On user input | Prompt text |
| `StartSessionEvent` | On startup | Model, auth type, tools, sandbox config |
| `ConversationFinishedEvent` | On session end | Reason |
| `ChatCompressionEvent` | On context compression | Token counts before/after |
| `AgentStartEvent` / `AgentFinishEvent` | On agent execution | Agent name, duration |
| `FlashFallbackEvent` | On model fallback | From/to model |

### Context Breakdown

On turn-ending responses (when control returns to the user), the telemetry
captures a detailed token usage breakdown:

| Field | Description |
|-------|-------------|
| `system_instructions` | Tokens from the system prompt |
| `tool_definitions` | Tokens from non-MCP tool definitions |
| `history` | Tokens from conversation history (excluding tool parts) |
| `tool_calls` | Per-tool token counts for function call/response parts |
| `mcp_servers` | Tokens from MCP tool definitions + calls (aggregated) |

### Metrics

| Metric | Type | Description |
|--------|------|-------------|
| Token usage | Counter | Input/output tokens per model |
| API response duration | Histogram | LLM call latency |
| API errors | Counter | Errors by type and status code |
| Tool calls | Counter/Histogram | Tool execution count and latency |
| File operations | Counter | File create/read/update counts |
| Content retries | Counter | Retry attempts and failures |
| Model routing | Counter | Model routing decisions |

## Configuration

### Environment Variables

**Langfuse (recommended for this fork):**

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `LANGFUSE_PUBLIC_KEY` | Yes | — | Langfuse project public key (`pk-lf-...`) |
| `LANGFUSE_SECRET_KEY` | Yes | — | Langfuse project secret key (`sk-lf-...`) |
| `LANGFUSE_BASE_URL` | No | `http://localhost:3000` | Self-hosted Langfuse URL |

When both keys are set, telemetry is auto-enabled with the correct endpoint,
protocol, and auth. No other configuration needed.

**Generic OpenTelemetry (advanced):**

| Env var | Default | Description |
|---------|---------|-------------|
| `GEMINI_TELEMETRY_ENABLED` | `false` | Enable/disable telemetry |
| `GEMINI_TELEMETRY_TARGET` | `local` | Export target: `local` or `gcp` |
| `GEMINI_TELEMETRY_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP collector endpoint |
| `GEMINI_TELEMETRY_OTLP_PROTOCOL` | `grpc` | Protocol: `grpc` or `http` |
| `GEMINI_TELEMETRY_LOG_PROMPTS` | `true` | Include prompt content in telemetry |
| `GEMINI_TELEMETRY_OUTFILE` | — | Write telemetry to a JSON file instead |
| `GEMINI_TELEMETRY_USE_COLLECTOR` | `false` | Use external OTLP collector |
| `GEMINI_TELEMETRY_USE_CLI_AUTH` | `false` | Use CLI credentials for GCP export |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | Alternative endpoint (OTel standard) |

### Settings File

`~/.gemini/settings.json`:

```json
{
  "telemetry": {
    "enabled": true,
    "target": "local",
    "otlpEndpoint": "http://localhost:3000/api/public/otel",
    "otlpProtocol": "http",
    "logPrompts": true
  }
}
```

### Precedence

Configuration is resolved in this order (highest wins):

```
1. CLI arguments (--telemetry, --telemetry-otlp-endpoint, etc.)
2. Environment variables (GEMINI_TELEMETRY_*)
3. Langfuse auto-detection (LANGFUSE_*)
4. Settings file (~/.gemini/settings.json)
5. Defaults (disabled, gRPC, localhost:4317)
```

Explicit `GEMINI_TELEMETRY_*` env vars always override Langfuse auto-config:

| Explicit override | Effect |
|-------------------|--------|
| `GEMINI_TELEMETRY_ENABLED=false` | Disables telemetry even with Langfuse keys |
| `GEMINI_TELEMETRY_OTLP_ENDPOINT=...` | Overrides Langfuse endpoint |
| `GEMINI_TELEMETRY_OTLP_PROTOCOL=grpc` | Overrides Langfuse HTTP default |

## Export Backends

### Langfuse (on-prem) — Recommended

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3000
```

Langfuse receives traces via its OTLP HTTP endpoint and displays them in its
native UI with model, token usage, latency, and conversation flow.

### OTLP Collector (Jaeger, Grafana Tempo, etc.)

```bash
GEMINI_TELEMETRY_ENABLED=true
GEMINI_TELEMETRY_OTLP_ENDPOINT=http://localhost:4317
GEMINI_TELEMETRY_OTLP_PROTOCOL=grpc  # or http
```

Any OTLP-compatible backend works: Jaeger, Grafana Tempo, Honeycomb, Datadog,
New Relic, etc.

### File Export (local debugging)

```bash
GEMINI_TELEMETRY_ENABLED=true
GEMINI_TELEMETRY_OUTFILE=/tmp/gemini-traces.json
```

Writes spans, logs, and metrics as JSON to the specified file. Useful for
debugging the telemetry pipeline itself.

### Console Export (development)

```bash
GEMINI_TELEMETRY_ENABLED=true
# No endpoint or outfile set → falls back to console
```

Prints telemetry to stderr. Noisy but useful for development.

### GCP Direct Export

```bash
GEMINI_TELEMETRY_ENABLED=true
GEMINI_TELEMETRY_TARGET=gcp
GOOGLE_CLOUD_PROJECT=my-project
```

Exports directly to Cloud Trace, Cloud Monitoring, and Cloud Logging. Requires
Application Default Credentials.

## Python (LangChain) Telemetry

For the Python helper (`scripts/fork/gemini_llm.py`), use LangChain's Langfuse
callback handler. No code changes to `gemini_llm.py` needed.

### Install

```bash
pip install langfuse
```

### Usage

```python
from langfuse.langchain import CallbackHandler
from gemini_llm import from_model

# CallbackHandler reads LANGFUSE_* env vars automatically
handler = CallbackHandler()

llm = from_model("[OpenAI] gpt-5")
response = llm.invoke("Hello", config={"callbacks": [handler]})

# With metadata
response = llm.invoke("Explain Python GIL", config={
    "callbacks": [handler],
    "metadata": {
        "langfuse_user_id": "jetlee",
        "langfuse_session_id": "coding-session-1",
        "langfuse_tags": ["gpt5", "explanation"],
    }
})

# Streaming works too
for chunk in llm.stream("Write a haiku", config={"callbacks": [handler]}):
    print(chunk.content, end="", flush=True)

# Flush on exit (important for short-lived scripts)
from langfuse import get_client
get_client().shutdown()
```

## Architecture

### Key Files

| File | Role |
|------|------|
| `packages/core/src/telemetry/sdk.ts` | OTel SDK initialization, exporter selection |
| `packages/core/src/telemetry/config.ts` | Config resolution (env → settings), Langfuse detection |
| `packages/core/src/telemetry/index.ts` | Public exports, default constants |
| `packages/core/src/telemetry/constants.ts` | GenAI semantic convention keys, operation types |
| `packages/core/src/telemetry/trace.ts` | `runInDevTraceSpan()` — span lifecycle management |
| `packages/core/src/telemetry/loggers.ts` | Event logging functions (`logApiRequest`, etc.) |
| `packages/core/src/telemetry/metrics.ts` | Metric recording functions |
| `packages/core/src/telemetry/types.ts` | Event type definitions (1000+ lines) |
| `packages/core/src/telemetry/file-exporters.ts` | File-based JSON export |
| `packages/core/src/telemetry/gcp-exporters.ts` | GCP direct export |
| `packages/core/src/telemetry/uiTelemetry.ts` | In-memory UI metrics |
| `packages/core/src/core/loggingContentGenerator.ts` | ContentGenerator telemetry wrapper |
| `packages/core/src/config/config.ts` | `TelemetrySettings` interface, Config getters |

### Data Flow

```
User prompt
  ↓
ContentGenerator.generateContentStream()
  ↓
LoggingContentGenerator (telemetry wrapper)
  ├── logApiRequest()  → creates ApiRequestEvent
  ├── runInDevTraceSpan(LLMCall)  → creates OTel span
  │     ├── sets gen_ai.* attributes
  │     ├── delegates to OpenAIContentGenerator
  │     └── on complete: sets output, token usage, status
  ├── logApiResponse() → creates ApiResponseEvent
  │     └── includes context breakdown, duration, token counts
  └── logApiError()    → creates ApiErrorEvent (on failure)
        └── includes error type, HTTP status, duration

Events flow through dual pipeline:
  ├── ClearcutLogger (Google internal) → batched
  └── OpenTelemetry Logger → batched → OTLP HTTP exporter
        └── POST to Langfuse /api/public/otel/v1/{traces,logs,metrics}
              with Authorization: Basic base64(pk:sk)
```

### Span Lifecycle

`runInDevTraceSpan()` manages span creation and cleanup:

1. Creates an active span with the operation name (`llm_call`, `tool_call`, etc.)
2. Provides a `SpanMetadata` object to the consumer for populating:
   - `input`: request data
   - `output`: response data
   - `error`: exception if occurred
   - `attributes`: custom attributes (semantic conventions)
3. On completion, sets all attributes on the span and ends it
4. For streaming operations (`noAutoEnd: true`), the consumer calls `endSpan()`
   manually when the stream finishes
5. Error handling: if an exception occurs, the span is marked ERROR and the
   exception is recorded

### Event Buffering

Events generated before the OTel SDK finishes initialization are buffered in
`telemetryBuffer[]`. Once `initializeTelemetry()` completes, all buffered events
are flushed. This ensures no telemetry is lost during startup.

## Troubleshooting

### No traces appearing in Langfuse

1. **Check env vars are loaded**: `echo $LANGFUSE_PUBLIC_KEY` — should not be empty
2. **Check Langfuse is running**: `curl http://localhost:3000/api/public/health`
3. **Enable debug logging**: Run with `--debug` flag to see OTel SDK output
4. **Check the file export**: Set `GEMINI_TELEMETRY_OUTFILE=/tmp/traces.json` to
   verify telemetry is being generated, then check the file
5. **Check precedence**: If `GEMINI_TELEMETRY_ENABLED=false` is set anywhere
   (env, settings.json), it overrides Langfuse auto-enable

### Telemetry is too verbose

Set `GEMINI_TELEMETRY_LOG_PROMPTS=false` to exclude prompt/response content from
telemetry. Spans will still capture model, duration, and token counts.

### Langfuse shows spans but no token counts

Token usage depends on the LLM provider returning usage metadata in the API
response. Some on-prem vLLM deployments may not include `usage` in streaming
responses. This is a provider-side issue, not a telemetry issue.
v
