# OpenAI-Compatible Mode — Full Documentation

This document explains how Gemini CLI's OpenAI-compatible mode works, from
environment detection through model selection to API communication.

## Overview

When certain environment variables are detected, Gemini CLI replaces the Google
auth dialog with an **LLM model picker**. The selected model is accessed via the
[OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat),
which is supported by most LLM providers (OpenRouter, vLLM, LiteLLM, etc.).

## How It Works

### 1. Environment Detection

On startup, `getAuthTypeFromEnv()` in
`packages/core/src/core/contentGenerator.ts` checks for these env vars (in
order):

| Env Var              | What it indicates                 |
| -------------------- | --------------------------------- |
| `A2G_LOCATION`       | a2g environment (CORP/DEV/HOME)   |
| `OPENROUTER_API_KEY` | OpenRouter API key available      |
| `OPENAI_BASE_URL`    | Custom OpenAI-compatible endpoint |

If **any** of these are set, the auth type is set to `OPENAI_COMPATIBLE` and the
Google auth flow is skipped entirely.

> **Priority note:** OpenAI-compatible mode takes precedence over all Google
> auth methods. The detection order in `getAuthTypeFromEnv()` is:
>
> 1. `A2G_LOCATION` set → `OPENAI_COMPATIBLE`
> 2. `OPENROUTER_API_KEY` set → `OPENAI_COMPATIBLE`
> 3. `OPENAI_BASE_URL` set → `OPENAI_COMPATIBLE`
> 4. `GEMINI_API_KEY` set → `USE_GEMINI`
> 5. None → `null` (show Google auth dialog)
>
> This means if both `A2G_LOCATION` and `GEMINI_API_KEY` are set, OpenAI mode
> wins silently. To use Google auth instead, unset the OpenAI trigger vars:
> `unset A2G_LOCATION OPENROUTER_API_KEY OPENAI_BASE_URL`

### 2. Model Registry

The model registry at `packages/core/src/config/llmRegistry.ts` defines all
available models. Each model has:

```typescript
interface LLMModelConfig {
  model: string; // Display name in picker
  modelAlias: string; // Actual model ID sent to the API
  url: string; // OpenAI-compatible base URL
  apiKeyEnv: string; // Env var name for the API key
  contextLength: number; // Context window size
  maxTokens?: number; // Max output tokens
  reasoningModel: boolean; // Whether it's a reasoning/thinking model
  extraBody?: object; // Extra fields sent in API requests
  defaultHeaders?: object; // Custom HTTP headers (e.g., for corp auth)
  corp: boolean; // Available in CORP environment
  home: boolean; // Available in HOME environment
  dev: boolean; // Available in DEV environment
}
```

### 3. Environment-Based Filtering

`detectLocation()` reads `A2G_LOCATION` and maps it:

| Env Value                       | Environment | Models shown                     |
| ------------------------------- | ----------- | -------------------------------- |
| `COMPANY`, `PRODUCTION`, `CORP` | CORP        | On-prem models (corp-flagged)    |
| `DEVELOPMENT`, `DEV`            | DEV         | Dev + default + Anthropic models |
| `HOME` (or unset)               | HOME        | Same as DEV                      |

`getAvailableModels()` filters by the detected environment and returns only
models where the corresponding flag (`corp`, `dev`, `home`) is `true`.

### 4. Model Picker UI

`AuthDialog.tsx` renders the `OpenAIModelPicker` component which:

1. Lists available models with details (context length, reasoning tag)
2. Pre-selects the last used model (saved in `~/.gemini/settings.json`)
3. On selection: calls `config.setModel()` →
   `config.refreshAuth(OPENAI_COMPATIBLE)`
4. Shows connection errors inline if the model fails to connect

### 5. Auto-Connect on Startup

If a model was previously selected and saved, `initializer.ts` attempts to
auto-connect on startup:

1. Reads `security.auth.selectedModel` from settings
2. Validates the model still exists in the registry
3. Calls `config.setModel()` + `config.refreshAuth()`
4. If successful, skips the model picker entirely
5. If it fails, falls through to show the model picker

### 6. Content Generation

`OpenAIContentGenerator` (in `packages/core/src/core/openaiContentGenerator.ts`)
implements the `ContentGenerator` interface using the OpenAI Node.js SDK:

- **`generateContent()`** — Non-streaming request
- **`generateContentStream()`** — Streaming with tool call fragment accumulation
- **`countTokens()`** — Heuristic estimate (~4 chars per token)

### 7. Type Mapping

`openaiTypeMapper.ts` converts between Gemini and OpenAI formats:

| Direction       | Conversion                                        |
| --------------- | ------------------------------------------------- |
| Gemini → OpenAI | `Content[]` → `ChatCompletionMessageParam[]`      |
| Gemini → OpenAI | `Tool[]` → `ChatCompletionTool[]`                 |
| OpenAI → Gemini | `ChatCompletion` → `GenerateContentResponse`      |
| OpenAI → Gemini | `ChatCompletionChunk` → `GenerateContentResponse` |

Tool call IDs are tracked per-instance via `ToolCallIdTracker` to maintain
correct ID mapping across multi-turn conversations.

## Model Categories

### API Key Resolution

The API key is resolved per-model via `createOpenAIContentGenerator()` in
`openaiFactory.ts`:

```
1. modelConfig.apiKeyEnv  →  explicit env var from config/models.default.json
2. inferDefaultApiKeyEnv(url)  →  auto-detect from model URL:
     - anthropic.com  →  ANTHROPIC_API_KEY
     - openrouter.ai  →  OPENROUTER_API_KEY
     - everything else →  OPENAI_API_KEY
3. config.apiKey          →  from CLI flags
4. '' (empty string)      →  corp endpoints don't require bearer auth
```

This means `apiKeyEnv` in `config/models.default.json` is optional — the URL-based
inference handles the common cases automatically.

### Corporate (On-Prem)

Base URL: `http://a2g.samsungds.net:7620/v1` (OpenAI-compatible vLLM)

API key: Falls through to `OPENAI_API_KEY` or empty string.

Corp models authenticate via **custom HTTP headers** instead of API keys. The
GaussO model uses a lazy getter for `defaultHeaders` that reads env vars at
access time (not import time):

- `x-dep-ticket` — extracted from `FALLBACK_API_KEY_1`
- `Send-System-Name` — extracted from `FALLBACK_API_KEY_1`
- `User-Id` — from `AD_ID`
- `User-Type` — hardcoded `AD_ID`

Models: GLM-5 (thinking/non-thinking), Kimi-K2.5 (thinking/non-thinking),
Qwen3.5 (35B/122B), gpt-oss-120b, GaussO-Owl-Ultra-Instruct

### OpenAI (Direct)

Base URL: `https://api.openai.com/v1`

API key: `OPENAI_API_KEY` (auto-detected from URL)

Models: GPT-4o, GPT-4o-mini, GPT-5 (regular/mini), GPT-5.2

### Anthropic (Direct)

Base URL: `https://api.anthropic.com/v1`

API key: `ANTHROPIC_API_KEY` (auto-detected from URL)

Models: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001

### OpenRouter

Base URL: `https://openrouter.ai/api/v1`

API key: `OPENROUTER_API_KEY` (auto-detected from URL)

Models: deepseek/deepseek-v3.2 (and any other OpenRouter models added to the
registry)

## Streaming and Tool Calls

### Text Streaming

Text chunks are yielded immediately as they arrive from the API.

### Tool Call Streaming

Tool calls arrive as fragments across multiple chunks. The generator accumulates
fragments in a `pendingToolCalls` map and emits them as a single response when:

1. `finish_reason` is `"tool_calls"` (standard behavior), or
2. The stream ends with pending tool calls (handles providers that return
   `finish_reason: "stop"` even with tool calls — common with OpenRouter/vLLM)

### Tool Call ID Tracking

`ToolCallIdTracker` maintains a per-instance mapping between Gemini-style
function names and OpenAI-style tool call IDs. This is critical for multi-turn
conversations where the same tool may be called multiple times.

## Configuration

### Settings (persistent)

Stored in `~/.gemini/settings.json`:

```json
{
  "security": {
    "auth": {
      "selectedType": "openai-compatible",
      "selectedModel": "dev-DeepSeek-V3.2"
    }
  }
}
```

### Environment Variables

See the [Install Guide](./install-guide.md) for setup instructions.

Required (at least one):

- `A2G_LOCATION` — Environment detection
- `OPENROUTER_API_KEY` — OpenRouter key
- `OPENAI_BASE_URL` — Custom endpoint

Model-specific:

- `OPENAI_API_KEY` — OpenAI models
- `ANTHROPIC_API_KEY` — Anthropic models
- `OPENROUTER_API_KEY` — OpenRouter models
- `FALLBACK_API_KEY_1` — Corp model auth headers
- `AD_ID` — Corp user identification

## Telemetry

See [telemetry.md](../tracing/telemetry.md) for the full telemetry documentation,
including Langfuse setup, what gets traced, configuration, and Python usage.

**Quick start** — add to `~/.env`:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3000
```

## Files

| File                                               | Role                                      |
| -------------------------------------------------- | ----------------------------------------- |
| `config/models.default.json`                              | Model registry (repo root, edit this)     |
| `packages/core/src/config/llmRegistry.ts`          | JSON config loader, env detection         |
| `packages/core/src/core/openaiFactory.ts`          | API key inference, ContentGenerator factory |
| `packages/core/src/core/openaiContentGenerator.ts` | ContentGenerator using OpenAI SDK         |
| `packages/core/src/core/openaiTypeMapper.ts`       | Gemini ↔ OpenAI type conversion          |
| `packages/core/src/core/contentGenerator.ts`       | AuthType enum, factory, env detection     |
| `packages/cli/src/ui/auth/AuthDialog.tsx`          | Auth dialog (routes to model picker)      |
| `packages/cli/src/ui/auth/OpenAIModelPicker.tsx`   | Model picker UI                           |
| `packages/cli/src/core/initializer.ts`             | Auto-connect on startup                   |
| `packages/cli/src/ui/auth/useAuth.ts`              | Auth state management                     |
| `scripts/fork/gemini_llm.py`                       | Python LLM helper (LangChain)             |
