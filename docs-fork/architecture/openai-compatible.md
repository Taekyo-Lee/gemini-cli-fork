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

| Env Var                      | What it indicates                 |
| ---------------------------- | --------------------------------- |
| `PROJECT_A2G_LOCATION`       | a2g environment (CORP/DEV/HOME)   |
| `PROJECT_OPENROUTER_API_KEY` | OpenRouter API key available      |
| `OPENAI_BASE_URL`            | Custom OpenAI-compatible endpoint |

If **any** of these are set, the auth type is set to `OPENAI_COMPATIBLE` and the
Google auth flow is skipped entirely.

> **Priority note:** OpenAI-compatible mode takes precedence over all Google
> auth methods. The detection order in `getAuthTypeFromEnv()` is:
>
> 1. `PROJECT_A2G_LOCATION` set → `OPENAI_COMPATIBLE`
> 2. `PROJECT_OPENROUTER_API_KEY` set → `OPENAI_COMPATIBLE`
> 3. `OPENAI_BASE_URL` set → `OPENAI_COMPATIBLE`
> 4. `GEMINI_API_KEY` set → `USE_GEMINI`
> 5. None → `null` (show Google auth dialog)
>
> This means if both `PROJECT_A2G_LOCATION` and `GEMINI_API_KEY` are set, OpenAI
> mode wins silently. To use Google auth instead, unset the OpenAI trigger vars:
> `unset PROJECT_A2G_LOCATION PROJECT_OPENROUTER_API_KEY OPENAI_BASE_URL`

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

`detectLocation()` reads `PROJECT_A2G_LOCATION` and maps it:

| Env Value                       | Environment | Models shown                          |
| ------------------------------- | ----------- | ------------------------------------- |
| `COMPANY`, `PRODUCTION`, `CORP` | CORP        | On-prem models (corp-flagged)         |
| `DEVELOPMENT`, `DEV`            | DEV         | Dev + default + Anthropic models      |
| `HOME` (or unset)               | HOME        | Same as DEV                           |

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

### Corporate (On-Prem)

Base URL: `http://a2g.samsungds.net:7620/v1`

These models run on internal infrastructure and do **not** have an `apiKeyEnv`
field. Instead, API key resolution falls through the chain in
`createContentGenerator()`:

```
1. modelConfig.apiKeyEnv  →  (undefined for corp models)
2. PROJECT_OPENAI_API_KEY →  (used as fallback)
3. OPENAI_API_KEY         →  (standard OpenAI env var)
4. config.apiKey          →  (from CLI flags)
5. '' (empty string)      →  (corp endpoints don't require bearer auth)
```

Corp models authenticate via **custom HTTP headers** instead of API keys. The
GaussO model uses a lazy getter for `defaultHeaders` that reads env vars at
access time (not import time):

- `x-dep-ticket` — extracted from `PROJECT_FALLBACK_API_KEY_1`
- `Send-System-Name` — extracted from `PROJECT_FALLBACK_API_KEY_1`
- `User-Id` — from `PROJECT_AD_ID`
- `User-Type` — hardcoded `AD_ID`

Models: GLM-5 (thinking/non-thinking), Kimi-K2.5 (thinking/non-thinking),
Qwen3.5 (35B/122B), gpt-oss-120b, GaussO-Owl-Ultra-Instruct

### Dev/Home (OpenRouter)

Base URL: `https://openrouter.ai/api/v1`

API key: `PROJECT_OPENROUTER_API_KEY`

Models: DeepSeek-V3.2 (reasoning/non-reasoning), Claude Haiku 4.5
(thinking/generic), Gemini 3.1 Pro Preview, Claude Opus 4.6

### Default (OpenAI Direct)

Base URL: `https://api.openai.com/v1`

API key: `PROJECT_OPENAI_API_KEY`

Models: GPT-4o, GPT-4o-mini, GPT-4.1 (regular/mini/nano), o1, o3-mini, o4-mini,
GPT-5 (regular/nano/mini), GPT-5.2

### Anthropic

Base URL: `https://api.anthropic.com/v1`

API key: `PROJECT_ANTHROPIC_API_KEY`

Models: claude-haiku-4.5

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

- `PROJECT_A2G_LOCATION` — Environment detection
- `PROJECT_OPENROUTER_API_KEY` — OpenRouter key
- `OPENAI_BASE_URL` — Custom endpoint

Model-specific:

- `PROJECT_OPENAI_API_KEY` — OpenAI models
- `PROJECT_ANTHROPIC_API_KEY` — Anthropic models
- `PROJECT_OPENROUTER_API_KEY` — OpenRouter models
- `PROJECT_FALLBACK_API_KEY_1` — Corp model auth headers
- `PROJECT_AD_ID` — Corp user identification

## Files

| File                                               | Role                                  |
| -------------------------------------------------- | ------------------------------------- |
| `packages/core/src/config/llmRegistry.ts`          | Model registry (mirrors a2g_models)   |
| `packages/core/src/core/openaiContentGenerator.ts` | ContentGenerator using OpenAI SDK     |
| `packages/core/src/core/openaiTypeMapper.ts`       | Gemini ↔ OpenAI type conversion      |
| `packages/core/src/core/contentGenerator.ts`       | AuthType enum, factory, env detection |
| `packages/cli/src/ui/auth/AuthDialog.tsx`          | Model picker UI                       |
| `packages/cli/src/core/initializer.ts`             | Auto-connect on startup               |
| `packages/cli/src/config/settingsSchema.ts`        | Settings schema (selectedModel field) |
| `packages/cli/src/ui/auth/useAuth.ts`              | Auth state management                 |
