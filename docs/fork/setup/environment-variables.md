# Environment Variables

All fork-specific environment variables. Set these in `.env` at the repo root (loaded automatically at startup).

See `.env.example` for a ready-to-copy template.

---

## Core

### `GEMINI_FORK_DIR`

Repo root path. Used by `scripts/fork/setup.sh` to locate `config/models.default.json` and `.env`.

| | |
|---|---|
| **Required** | No (auto-set by `scripts/fork/setup.sh`) |
| **Example** | `/home/jetlee/workspace/gemini-cli-fork` |
| **Used in** | `scripts/fork/setup.sh` |

### `A2G_LOCATION`

Controls which models appear in the picker by filtering the `corp`/`home`/`dev` flags in `config/models.default.json`.

| | |
|---|---|
| **Required** | No |
| **Default** | Auto-detected from hostname; falls back to `HOME` |
| **Values** | `CORP` / `PRODUCTION` / `COMPANY` -> corp, `DEV` / `DEVELOPMENT` -> dev, anything else -> home |
| **Used in** | `packages/core/src/config/llmRegistry.ts`, `packages/core/src/core/openaiFactory.ts` |

### `_GEMINI_MODELS_PATH`

Explicit path to a `models.default.json` file. Set internally after initial discovery so subprocesses reuse the same file. Can be set manually to override the default search order.

| | |
|---|---|
| **Required** | No (internal) |
| **Default** | Search order: this var -> `config/models.default.json` relative to repo root -> walk up from cwd |
| **Example** | `/opt/configs/models.default.json` |
| **Used in** | `packages/core/src/config/llmRegistry.ts` |

---

## API Keys

Set keys for the providers you use. Base URLs come from each model's `url` field in `config/models.default.json`.

| Variable | Provider |
|---|---|
| `OPENAI_API_KEY` | OpenAI / generic OpenAI-compatible endpoints |
| `ANTHROPIC_API_KEY` | Anthropic |
| `OPENROUTER_API_KEY` | OpenRouter |

The factory resolves keys in this order per model entry: model-level `apiKeyEnv` field -> provider-level detection from the base URL (e.g. `openrouter.ai` -> `OPENROUTER_API_KEY`) -> `OPENAI_API_KEY` as final fallback.

**Used in:** `packages/core/src/core/openaiFactory.ts`

---

## Corporate Auth (CORP environment only)

### `AD_ID`

Active Directory user ID. Included in corporate authentication headers sent with API requests.

| | |
|---|---|
| **Required** | Only in CORP environment |
| **Example** | `taekyo.lee` |
| **Used in** | `packages/core/src/config/llmRegistry.ts` |

### `FALLBACK_API_KEY_1`

Corporate auth credentials. Format: `system_name/dep_ticket`. Parsed into separate auth headers for the corporate proxy.

| | |
|---|---|
| **Required** | Only in CORP environment |
| **Example** | `my_system/DEP-12345` |
| **Used in** | `packages/core/src/config/llmRegistry.ts` |

---

## Langfuse Telemetry

On-prem OpenTelemetry tracing via Langfuse. **All three** must be set to enable tracing. No data leaves your network.

| Variable | Example |
|---|---|
| `LANGFUSE_PUBLIC_KEY` | `pk-lf-...` |
| `LANGFUSE_SECRET_KEY` | `sk-lf-...` |
| `LANGFUSE_BASE_URL` | `http://localhost:3000` |

When `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are present, telemetry auto-enables and configures the OTLP endpoint from `LANGFUSE_BASE_URL`. If `LANGFUSE_BASE_URL` is omitted but the keys are set, it defaults to `http://localhost:3000`.

**Used in:** `packages/core/src/telemetry/config.ts`

---

## Telemetry Overrides

These override the Langfuse auto-configuration. Recommended to leave unset if using Langfuse.

### `GEMINI_TELEMETRY_ENABLED`

Force-enable or disable telemetry regardless of other settings.

| | |
|---|---|
| **Required** | No |
| **Values** | `true` / `1` to enable, `false` / `0` to disable |
| **Used in** | `packages/core/src/telemetry/config.ts` |

### `GEMINI_TELEMETRY_TARGET`

Telemetry export target.

| | |
|---|---|
| **Required** | No |
| **Values** | `local`, `gcp` |
| **Used in** | `packages/core/src/telemetry/config.ts` |

### `GEMINI_TELEMETRY_OTLP_ENDPOINT`

OpenTelemetry endpoint URL. Takes precedence over `OTEL_EXPORTER_OTLP_ENDPOINT` and the Langfuse-derived endpoint.

| | |
|---|---|
| **Required** | No |
| **Default** | Falls back to `OTEL_EXPORTER_OTLP_ENDPOINT`, then Langfuse-derived endpoint |
| **Example** | `http://localhost:4317` |
| **Used in** | `packages/core/src/telemetry/config.ts` |

### `GEMINI_TELEMETRY_OTLP_PROTOCOL`

OTLP export protocol.

| | |
|---|---|
| **Required** | No |
| **Default** | `http` (when Langfuse auto-configured) |
| **Values** | `grpc`, `http` |
| **Used in** | `packages/core/src/telemetry/config.ts` |

### `GEMINI_TELEMETRY_LOG_PROMPTS`

Include LLM prompts in trace spans.

| | |
|---|---|
| **Required** | No |
| **Values** | `true` / `1` to enable |
| **Used in** | `packages/core/src/telemetry/config.ts` |

### `GEMINI_TELEMETRY_OUTFILE`

Write telemetry/trace output to a file.

| | |
|---|---|
| **Required** | No |
| **Example** | `~/gemini-traces.json` |
| **Used in** | `packages/core/src/telemetry/config.ts`, `packages/core/src/utils/debugLogger.ts` |

### `GEMINI_TELEMETRY_USE_COLLECTOR`

Use an OpenTelemetry collector for export instead of direct OTLP.

| | |
|---|---|
| **Required** | No |
| **Values** | `true` / `1` to enable |
| **Used in** | `packages/core/src/telemetry/config.ts` |

### `GEMINI_TELEMETRY_USE_CLI_AUTH`

Use CLI authentication credentials for telemetry requests (e.g. GCP auth).

| | |
|---|---|
| **Required** | No |
| **Values** | `true` / `1` to enable |
| **Used in** | `packages/core/src/telemetry/config.ts` |

---

## Reasoning Display

### `GEMINI_SHOW_REASONING`

Controls whether reasoning/thinking tokens from reasoning models (GLM-5, DeepSeek R1, QwQ, etc.) are displayed. When enabled, accumulated reasoning is shown as a `Thinking...` block before the final answer.

| | |
|---|---|
| **Required** | No |
| **Default** | `true` (reasoning displayed) |
| **Values** | `false` or `0` = hide reasoning, unset or anything else = show |
| **Used in** | `packages/core/src/core/openaiContentGenerator.ts`, `packages/core/src/core/openaiTypeMapper.ts` |

---

## Debug

### `GEMINI_DEBUG_LOG_FILE`

Append debug logs to a file. Creates a timestamped write stream logging all debug/log/warn/error messages. Can log sensitive info and grow large -- leave commented out unless debugging.

| | |
|---|---|
| **Required** | No |
| **Example** | `~/gemini_debug.log` |
| **Used in** | `packages/core/src/utils/debugLogger.ts` |

---

## SSL / Proxy (Corporate Networks)

### `VERIFY_SSL`

Controls SSL certificate verification. Set to `false` for corporate networks with SSL-intercepting proxies.

| | |
|---|---|
| **Required** | No (corporate networks only) |
| **Default** | `true` |
| **Values** | `true` / `false` |

### `SSL_CERT_FILE`

CA bundle path for SSL-intercepting proxies (Zscaler, Bluecoat, corporate CA).

| | |
|---|---|
| **Required** | No (corporate networks only) |
| **Example** | `/etc/ssl/certs/ca-certificates.crt` |

### `NODE_EXTRA_CA_CERTS`

Node.js standard variable for additional CA certificates. Use alongside or instead of `SSL_CERT_FILE` for corporate certificate chains.

| | |
|---|---|
| **Required** | No |
| **Example** | `/etc/ssl/certs/ca-certificates.crt` |

### `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`

Standard proxy configuration. Case-insensitive (`http_proxy` also works). Automatically forwarded into sandbox containers.

| | |
|---|---|
| **Required** | No |
| **Example** | `http://proxy.corp.example.com:8080` |
| **Used in** | `packages/cli/src/config/config.ts`, `packages/cli/src/utils/sandbox.ts` |

---

## OpenAI-Compatible Mode

### `OPENAI_BASE_URL`

Custom base URL for a single OpenAI-compatible endpoint. Signals OpenAI-compatible mode when set. Usually not needed when using `config/models.default.json` with the model picker (base URLs are defined per-model there).

| | |
|---|---|
| **Required** | No |
| **Example** | `http://vllm.corp.example.com:8000/v1` |
| **Used in** | `packages/core/src/core/openaiFactory.ts` |

---

## Upstream Variables (Google Auth)

These are upstream Gemini CLI variables for Google authentication. **Not needed for the fork's OpenAI-compatible mode** but still functional if you want to use Google's Gemini API directly.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini API key (USE_GEMINI auth type) |
| `GOOGLE_API_KEY` | Google API key (Vertex AI express mode) |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID (required for Vertex AI) |
| `GOOGLE_CLOUD_LOCATION` | GCP region (required for Vertex AI) |
| `GOOGLE_VERTEX_BASE_URL` | Custom Vertex AI endpoint |
| `GOOGLE_GEMINI_BASE_URL` | Custom Gemini API endpoint |
| `GOOGLE_GENAI_USE_VERTEXAI` | Force Vertex AI auth (`true`/`1`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account JSON |

**Used in:** `packages/core/src/core/contentGenerator.ts`, `packages/cli/src/config/auth.ts`
