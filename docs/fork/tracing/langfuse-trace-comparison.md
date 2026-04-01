# Langfuse Trace Comparison: LangChain vs Gemini-Fork

Side-by-side comparison of how traces appear in Langfuse UI.
Captured 2026-03-31. Use this as a reference for future improvements.

## Glossary

| Term | Meaning |
|------|---------|
| **Trace** | One complete user interaction (e.g., user types "hello", model responds). Contains one or more spans. |
| **Span** | A single timed operation within a trace (e.g., one LLM call, one tool execution). Spans can be nested (parent/child). |
| **Observation** | Langfuse's name for a span. Same thing, different terminology. |
| **OTLP** | OpenTelemetry Protocol — the standard wire format for sending traces/logs/metrics. Our fork sends OTLP over HTTP to Langfuse's `/api/public/otel` endpoint. |
| **OpenTelemetry (OTel)** | The open-source observability framework we use. It defines how to create spans, attach attributes, and export them via OTLP. |
| **Semantic Conventions** | Standardized attribute names (e.g., `gen_ai.request.model`). Langfuse recognizes these and maps them to its UI fields. |
| **Exporter** | The component that sends collected spans to a backend. We use `OTLPTraceExporterHttp` which POSTs to Langfuse. |
| **BatchSpanProcessor** | Collects spans in memory and sends them in batches (not one-by-one) for efficiency. |

## Trace List View

| Field | LangChain (Python) | Gemini-Fork (TypeScript) | Notes |
|-------|-------------------|--------------------------|-------|
| **Name** | `gpt-4.1-mini` | `gemini-cli:[OpenAI] gpt-4o-mini` | LangChain uses bare model name. Fork prefixes with `gemini-cli:` |
| **Input** | `[{"type":"text","text":"안녕"}]` | `[{"type":"text","text":"hello"}]` | Same format (LangChain-style) |
| **Output** | `[{"type":"text","text":"안녕하세요! 어떻게 도와드릴까요?","annotations":[...]}]` | `[{"type":"text","text":"Hello! How can I assist you today?"}]` | LangChain includes `annotations` and `id` fields from OpenAI response |
| **Latency** | 1.77s | 1.61s | Comparable |
| **Tokens** | `9 → 11 (Σ 20)` | `15,610 prompt → 10 completion (Σ 15,620)` | Fork has much higher prompt tokens due to large system prompt + tool definitions |
| **Cost** | `$0.000019` | (not shown) | LangChain callback includes cost calculation |
| **Observation Levels** | 1 | 1 (for `-p` mode), 2 (for interactive) | Interactive mode has extra `checkNextSpeaker` LLM call |

> **What is Observation Levels?** The count of spans (observations) within a
> single trace. Each LLM call, tool call, or agent call creates one observation.
> In interactive mode, gemini-fork makes 2 LLM calls per turn: (1) the main
> response generation, and (2) a `checkNextSpeaker` call that asks the model
> whether to continue or hand control back to the user. The `checkNextSpeaker`
> span is marked as a utility call and does **not** overwrite trace-level
> attributes — the trace display always shows the main response.

## Trace Detail View — Preview Tab

| Field | LangChain | Gemini-Fork |
|-------|-----------|-------------|
| **User section** | `hello` (rendered as chat bubble) | `text: "hello"` (rendered as key-value table) |
| **Assistant section** | `Hello! How can I assist you today?` (rendered as chat bubble) | `text: "Hello! How can I assist you today?"` (rendered as key-value table) |
| **Corrected Output (JSON)** | `{"role":"assistant","content":[{"type":"text","text":"...","annotations":[],"id":"msg_..."}]}` | `[{"type":"text","text":"..."}]` |

**Key difference:** LangChain's output includes OpenAI's native response envelope
(`role`, `annotations`, `id`), which Langfuse renders as a proper chat view.
The fork sends a flat array of content parts.

## Metadata Comparison

### LangChain Metadata

```json
{
  "ls_provider": "openai",
  "ls_model_name": "gpt-4.1-mini",
  "ls_model_type": "chat",
  "ls_integration": "langchain_chat_model",
  "resourceAttributes": {
    "telemetry.sdk.language": "python",
    "telemetry.sdk.name": "opentelemetry",
    "telemetry.sdk.version": "1.40.0",
    "service.name": "unknown_service"
  },
  "scope": {
    "name": "langfuse-sdk",
    "version": "4.0.4"
  }
}
```

| Key | Meaning |
|-----|---------|
| `ls_provider` | LLM provider name (LangSmith convention: `openai`, `anthropic`, etc.) |
| `ls_model_name` | Actual model ID sent to the API |
| `ls_model_type` | Model type: `chat`, `completion`, `embedding` |
| `ls_integration` | Which LangChain integration class produced the trace |
| `telemetry.sdk.language` | Programming language of the telemetry SDK |
| `telemetry.sdk.name` | OTel SDK name (`opentelemetry`) |
| `telemetry.sdk.version` | OTel SDK version |
| `service.name` | Application name (LangChain defaults to `unknown_service`) |
| `scope.name` | OTel instrumentation scope — `langfuse-sdk` means the Langfuse callback produced this trace |
| `scope.version` | Langfuse SDK version |

### Gemini-Fork Metadata

```json
{
  "attributes": {
    "gen_ai.request.model": "[OpenAI] gpt-4o-mini",
    "gen_ai.system_instructions": "(~15k chars of system prompt)",
    "gen_ai.tool.definitions": "(large array of tool schemas)",
    "gen_ai.operation.name": "llm_call",
    "gen_ai.agent.name": "gemini-cli",
    "gen_ai.agent.description": "Gemini CLI is an open-source AI agent...",
    "gen_ai.conversation.id": "3de02cf7-...",
    "gen_ai.usage.input_tokens": "15610",
    "gen_ai.usage.output_tokens": "10",
    "langfuse.span.name": "gemini-cli:[OpenAI] gpt-4o-mini",
    "langfuse.trace.name": "gemini-cli:[OpenAI] gpt-4o-mini"
  },
  "resourceAttributes": {
    "host.name": "DESKTOP-OL0Q677",
    "host.arch": "amd64",
    "process.pid": 2659136,
    "process.runtime.name": "nodejs",
    "process.runtime.version": "20.19.5",
    "service.name": "gemini-cli",
    "service.version": "v20.19.5",
    "session.id": "3de02cf7-..."
  },
  "scope": {
    "name": "gemini-cli",
    "version": "v1"
  }
}
```

#### `attributes` — data attached to each individual LLM call

> Each time gemini-cli calls an LLM, it creates a "span" (a single timed
> operation). These attributes describe that specific call — which model was
> used, what was sent, what came back, how many tokens were consumed.

| Key | Meaning |
|-----|---------|
| `gen_ai.request.model` | Model display name from `models.default.json` (e.g., `[OpenAI] gpt-4o-mini`) |
| `gen_ai.system_instructions` | Full system prompt sent to the model (JSON string, can be very large) |
| `gen_ai.tool.definitions` | All tool/function schemas available to the model (JSON array) |
| `gen_ai.operation.name` | Type of operation: `llm_call`, `tool_call`, `agent_call`, etc. |
| `gen_ai.agent.name` | Agent identifier — always `gemini-cli` |
| `gen_ai.agent.description` | Human-readable agent description |
| `gen_ai.conversation.id` | Session UUID — correlates all spans in one CLI session |
| `gen_ai.usage.input_tokens` | Prompt/input token count for this call |
| `gen_ai.usage.output_tokens` | Completion/output token count for this call |
| `langfuse.span.name` | **[FORK]** Overrides the observation name in Langfuse UI |
| `langfuse.trace.name` | **[FORK]** Overrides the trace name in Langfuse trace list |
| `langfuse.observation.input` | **[FORK]** User message in LangChain-style format for Langfuse Input column |
| `langfuse.observation.output` | **[FORK]** Model response in LangChain-style format for Langfuse Output column |
| `langfuse.trace.input` | **[FORK]** Same as observation input, but at trace level (survives multi-span traces) |
| `langfuse.trace.output` | **[FORK]** Same as observation output, but at trace level |

#### `resourceAttributes` — data about the machine and process, set once at startup

> These describe the environment where gemini-cli is running. They are the
> same for every span in the session — think of them as the "who/where" context
> (which machine, which user, which Node.js version).

| Key | Meaning |
|-----|---------|
| `host.name` | Machine hostname |
| `host.arch` | CPU architecture (`amd64`, `arm64`) |
| `host.id` | Unique host identifier |
| `process.pid` | OS process ID |
| `process.runtime.name` | Runtime: `nodejs` |
| `process.runtime.version` | Node.js version |
| `process.executable.name` | Executable path |
| `process.command_args` | Full command line (e.g., `["node", "packages/cli", "-p", "hello"]`) |
| `process.owner` | OS username |
| `service.name` | Application name: `gemini-cli` |
| `service.version` | Application version (currently maps to Node.js version) |
| `session.id` | Session UUID (same as `gen_ai.conversation.id`) |

#### `scope` — identifies which library produced these traces

> OpenTelemetry lets multiple libraries emit traces in the same process. The
> "scope" says which one produced this particular trace. For us it's always
> `gemini-cli` — the tracer we create in `trace.ts`.

| Key | Meaning |
|-----|---------|
| `scope.name` | Tracer name — `gemini-cli` (the OTel tracer that produced this span) |
| `scope.version` | Tracer version — `v1` |

## Key Differences Summary

| Aspect | LangChain | Gemini-Fork | Gap |
|--------|-----------|-------------|-----|
| **Integration** | Langfuse SDK callback (native) | OTLP HTTP export (standard) | Different ingestion paths |
| **Provider metadata** | `ls_provider`, `ls_model_name`, `ls_model_type` | `gen_ai.request.model` only | Fork lacks provider/type decomposition |
| **Cost tracking** | Calculated by Langfuse from model pricing | Not available | Langfuse needs model name in its pricing DB |
| **Chat rendering** | Full chat bubble view (User/Assistant) | Key-value table view | LangChain wraps output in `{role, content}` envelope |
| **Output format** | Includes `annotations`, `id` from OpenAI | Flat `[{type, text}]` only | Fork strips OpenAI response metadata |
| **System prompt** | Not included in trace | Full system prompt in `gen_ai.system_instructions` | Fork is more verbose (useful for debugging) |
| **Tool definitions** | Not included in trace | Full tool schemas in `gen_ai.tool.definitions` | Fork is more verbose (useful for debugging) |
| **Session tracking** | None (`service.name: unknown_service`) | `session.id`, `gen_ai.conversation.id` | Fork has better session correlation |
| **Interactive mode** | N/A (Python scripts are one-shot) | Multi-turn with `checkNextSpeaker` spans | Fork traces multi-turn conversations |

## Interactive Mode vs Bash Mode Tracing

Interactive mode (`gemini` → type prompt) and bash mode (`gemini -p "hello"`)
now produce equivalent trace-level metadata. Previously, interactive mode traces
appeared much weaker in Langfuse.

### The Problem (fixed)

In interactive mode, after the main LLM response, the system calls
`checkNextSpeaker()` — a utility LLM call that decides whether the user or model
should speak next. This created a **second** `llm_call` span that overwrote the
Langfuse trace-level attributes (`langfuse.trace.name`, `langfuse.trace.input`,
`langfuse.trace.output`) with its own minimal data:

- **Trace name**: showed the checker model instead of the user's model
- **Trace input**: showed the `CHECK_PROMPT` instead of the user's message
- **Trace output**: showed `{"next_speaker":"user"}` instead of the model's response

### The Fix

`loggingContentGenerator.ts` now checks the `LlmRole` parameter before setting
trace-level attributes. Only **primary** calls (`MAIN`, `SUBAGENT`) set
`langfuse.trace.*`. Utility calls (`UTILITY_NEXT_SPEAKER`, `UTILITY_COMPRESSOR`,
`UTILITY_ROUTER`, etc.) only set observation-level attributes
(`langfuse.observation.*`, `langfuse.span.*`).

### What Each Mode Produces

| Attribute | Bash mode (`-p`) | Interactive mode | Notes |
|-----------|-----------------|------------------|-------|
| `gen_ai.request.model` | Yes | Yes | Per-span, both modes |
| `gen_ai.system_instructions` | Yes | Yes | Per-span |
| `gen_ai.tool.definitions` | Yes | Yes | Per-span |
| `gen_ai.usage.input_tokens` | Yes | Yes | Per-span |
| `gen_ai.usage.output_tokens` | Yes | Yes | Per-span |
| `langfuse.trace.name` | Yes | Yes (main span only) | Utility spans no longer overwrite |
| `langfuse.trace.input` | Yes | Yes (main span only) | Shows user's message |
| `langfuse.trace.output` | Yes | Yes (main span only) | Shows model's response |
| Observation count | 1 | 2+ | Interactive has extra `checkNextSpeaker` span |

## Potential Improvements (Future)

1. **Chat bubble rendering**: Wrap output in `{role: "assistant", content: [...]}` 
   format so Langfuse renders it as a proper chat view
2. **Cost tracking**: Set `gen_ai.usage.cost` or model name in Langfuse's
   pricing-compatible format
3. **Provider metadata**: Add `ls_provider`, `ls_model_type` for Langfuse's
   model detection heuristics
4. ~~**Interactive mode output**: Ensure trace-level output shows the main
   response, not the `checkNextSpeaker` result~~ — **Fixed** (utility spans no
   longer set `langfuse.trace.*` attributes)
5. **Annotations**: Pass through OpenAI response annotations if available
