# TODO: Replace Auth with LLM Picker + OpenAI-Compatible API

## Overview

Replace the Gemini auth prompt with an LLM selection list. When user runs
`$ gemini`, show available models from the a2g_models registry, let them pick
one, and connect via OpenAI Chat Completions API.

---

## Phase 0: Project Setup & Test Script

- [x] **Create `scripts/test_openai_adapter.sh`** — build+run script for
      iterative testing
  - Loads env vars from `~/workspace/main/research/a2g_packages/envs/.env`
  - Builds the project
  - Runs `gemini` with OpenAI-compatible mode
  - Modes: `--status`, `--build-only`, `--run-only`, `--test`, `--quick`,
    `--python`, `--list-models`

- [x] **Add `openai` dependency to `packages/core/package.json`**
  - Added `"openai": "^4.96.0"` to dependencies
  - Ran `npm install` from repo root

- [x] **dotenv not needed** — env vars loaded by test script via `--env-file` or
      `source`

---

## Phase 1: TypeScript LLM Registry

### 1.1 Create the Registry

- [x] **Created `packages/core/src/config/llmRegistry.ts`**

  Mirrors the Python `a2g_models` LLMRegistry with all 27 models:
  - **8 CORP models** (url: `http://a2g.samsungds.net:7620/v1`): GLM-5-Thinking,
    GLM-5-Non-Thinking, Kimi-K2.5-Thinking, Kimi-K2.5-Non-Thinking,
    Qwen3.5-35B-A3B, Qwen3.5-122B-A10B, gpt-oss-120b, GaussO-Owl-Ultra-Instruct
  - **6 DEV/HOME models** (url: `https://openrouter.ai/api/v1`):
    dev-DeepSeek-V3.2, dev-DeepSeek-V3.2-non-reasoning, dev-claude-haiku-4.5,
    dev-claude-haiku-4.5-generic, dev-Gemini-3.1-Pro-Preview,
    dev-Claude-Opus-4.6
  - **12 Default OpenAI models** (url: `https://api.openai.com/v1`): gpt-4o,
    gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o1, o3-mini, o4-mini,
    gpt-5, gpt-5-nano, gpt-5-mini, gpt-5.2
  - **1 Anthropic model**: claude-haiku-4.5

  Exports: `LLMModelConfig`, `EnvironmentType`, `detectLocation()`,
  `getAvailableModels()`, `getModelByName()`, `getAllModels()`

### 1.2 Export the Registry

- [x] **Edited `packages/core/src/index.ts`**
  - Added `export * from './config/llmRegistry.js';`

---

## Phase 2: OpenAI ContentGenerator

### 2.1 Type Mapper

- [x] **Created `packages/core/src/core/openaiTypeMapper.ts`**

  Functions:
  - `geminiContentsToOpenAIMessages()` — Content[] →
    ChatCompletionMessageParam[]
  - `geminiToolsToOpenAITools()` — Tool[] → ChatCompletionTool[]
  - `openaiResponseToGeminiResponse()` — ChatCompletion →
    GenerateContentResponse
  - `openaiStreamChunkToGeminiResponse()` — ChatCompletionChunk →
    GenerateContentResponse
  - Tool call ID tracking with `toolCallIdMap` and `toolCallCounter`

### 2.2 Content Generator

- [x] **Created `packages/core/src/core/openaiContentGenerator.ts`**

  `OpenAIContentGenerator` class implementing `ContentGenerator`:
  - `generateContent()` — non-streaming request via OpenAI SDK
  - `generateContentStream()` — streaming with tool call fragment accumulation
  - `countTokens()` — heuristic `Math.ceil(text.length / 4)`
  - `embedContent()` — throws "not supported"
  - `normalizeContents()` helper for ContentListUnion → Content[]

### 2.3 Export

- [x] **Edited `packages/core/src/index.ts`**
  - Added `export * from './core/openaiContentGenerator.js';`
  - Added `export * from './core/openaiTypeMapper.js';`

---

## Phase 3: Wire Into Auth & Config

### 3.1 Add New Auth Type

- [x] **Edited `packages/core/src/core/contentGenerator.ts`**
  - Added `OPENAI_COMPATIBLE = 'openai-compatible'` to AuthType enum
  - Updated `getAuthTypeFromEnv()` — checks `OPENAI_BASE_URL`,
    `PROJECT_OPENROUTER_API_KEY`, `PROJECT_A2G_LOCATION`
  - Added `selectedOpenAIModel?: string` to `ContentGeneratorConfig`
  - Updated `createContentGeneratorConfig()` — early return for
    OPENAI_COMPATIBLE
  - Updated `createContentGenerator()` — new branch using `getModelByName()` to
    resolve model config, API key, base URL, and model alias

### 3.2 Model Pass-Through

- [x] **No changes needed to `packages/core/src/config/models.ts`**
  - `resolveModel()` already has a default pass-through case for unknown model
    names

### 3.3 Config Updates

- [x] **Config already supports `setModel()` and `refreshAuth()`**
  - `config.setModel(modelName, false)` sets the model
  - `config.refreshAuth(AuthType.OPENAI_COMPATIBLE)` creates the
    ContentGenerator

---

## Phase 4: Replace Auth Dialog with LLM Picker

### 4.1 Modify AuthDialog

- [x] **Edited `packages/cli/src/ui/auth/AuthDialog.tsx`**

  The model list matches the output of
  `on_prem_llms_test/list_available_llms.py`.

  Split into 3 components:
  - `AuthDialog` — routes to `OpenAIModelPicker` or `GoogleAuthDialog` based on
    `getAuthTypeFromEnv()`
  - `OpenAIModelPicker` — shows `getAvailableModels()` as radio buttons, on
    select: `config.setModel()` → `config.refreshAuth(OPENAI_COMPATIBLE)` →
    `setAuthState(Authenticated)`
  - `GoogleAuthDialog` — original auth flow, completely unchanged

### 4.2 Load Env Vars

- [x] **Handled by test script** — `source` or `--env-file` loads env vars
      before running
  - No runtime dotenv needed; env vars set in shell before `gemini` starts

### 4.3 Skip Google Auth

- [x] **Edited `packages/cli/src/core/initializer.ts`**
  - When OpenAI mode detected, skips `performInitialAuth()`
  - Forces `shouldOpenAuthDialog = true` to show LLM picker

- [x] **Edited `packages/cli/src/ui/auth/useAuth.ts`**
  - In the auth effect: when OpenAI mode detected, immediately
    `setAuthState(AuthState.Updating)` to show model picker without attempting
    Google auth

---

## Phase 5: Testing

### 5.1 Unit Tests

- [x] **Created `packages/core/src/config/llmRegistry.test.ts`** (15 tests)
  - `detectLocation()` — env var mapping, case-insensitivity, defaults
  - `getAvailableModels()` — DEV/HOME/CORP filtering
  - `getModelByName()` — known models, unknown models, correct config fields
  - `getAllModels()` — returns all regardless of environment

- [x] **Created `packages/core/src/core/openaiTypeMapper.test.ts`** (25 tests)
  - `geminiContentsToOpenAIMessages()` — user/model/system/function roles, tool
    calls, edge cases
  - `geminiToolsToOpenAITools()` — conversion, flattening, empty handling
  - `openaiResponseToGeminiResponse()` — text, tool calls, usage, finish
    reasons, malformed args
  - `openaiStreamChunkToGeminiResponse()` — text deltas, usage-only chunks,
    streaming tool calls

- [x] **Created `packages/core/src/core/openaiContentGenerator.test.ts`** (9
      tests)
  - `generateContent()` — correct request/response, tools, extraBody, string
    contents
  - `generateContentStream()` — text chunks, tool call accumulation, stream
    options
  - `countTokens()` — heuristic returns positive number
  - `embedContent()` — throws not supported

### 5.2 Verify Upstream Tests

- [x] `npm test -w @google/gemini-cli-core` — **all 5587 tests pass, 0
      failures**
- [x] `npm run typecheck` — all packages pass (fixed misplaced
      `llmRegistry.test.ts` that was in `packages/cli` instead of
      `packages/core`)
- [x] `npm run lint` — all clean (added eslint-disable comments for necessary
      `Object.setPrototypeOf` returns and `JSON.parse` casts, removed
      unnecessary type assertions)

---

## Phase 6: Polish & Documentation

- [ ] Remember last selected model (save to `~/.gemini/settings.json`)
- [ ] Show model details in selection list (context length, reasoning
      capability)
- [ ] Handle connection errors gracefully (model unavailable, invalid API key)
- [x] Update `INSTALL_GUIDE.md` with OpenAI-compatible setup (Mode A/B, `set -a`
      for env export, troubleshooting section for common issues)
- [ ] Create `docs/openai-compatible.md` with full documentation

---

## Phase 7: Bug Fixes & Stability

Findings from code scrutiny — 16 issues (3 critical, 7 medium, 6 minor).

### 7.1 Critical (cause real failures)

- [ ] **Fix global mutable state in `openaiTypeMapper.ts`** — ROOT CAUSE of
      multi-turn failures. `toolCallIdMap`/`toolCallCounter` (lines 40-41) are
      module-level singletons. When same tool is called twice, IDs get
      overwritten causing ID mismatches and OpenAI API rejections. Fix:
      encapsulate in a `ToolCallIdTracker` class, instantiate per-request in
      `OpenAIContentGenerator`.

- [ ] **Fix streaming tool calls dropped on `finish_reason: "stop"`** —
      `openaiContentGenerator.ts` lines 189-193. `pendingToolCalls.clear()`
      without emitting. Some providers (OpenRouter, vLLM) return `"stop"` even
      with tool calls. Fix: emit pending tool calls when
      `pendingToolCalls.size > 0` regardless of finish_reason.

- [ ] **Add `OPENAI_COMPATIBLE` to `validateAuthMethod()`** —
      `packages/cli/src/config/auth.ts` line 45 falls through to
      `'Invalid auth method selected.'`. Breaks non-interactive mode
      (`gemini --prompt "..."`, piped input). Fix: add early return `null` for
      `OPENAI_COMPATIBLE`.

### 7.2 Medium (incorrect behavior)

- [ ] Add `apiKeyEnv: 'PROJECT_OPENROUTER_API_KEY'` to
      `dev-claude-haiku-4.5-generic` in `llmRegistry.ts`
- [ ] Defer GaussO `defaultHeaders` from module-load to factory-time in
      `contentGenerator.ts` (env vars empty at import)
- [ ] Send `max_tokens` to OpenAI API (read from `LLMModelConfig.maxTokens`,
      pass through `OpenAIContentGeneratorConfig`)
- [ ] Fix `extraBody` spread ordering — spread before explicit fields, or filter
      reserved keys (`model`, `messages`, `stream`)
- [ ] Improve `countTokens()` — extract text from parts before counting, not
      `JSON.stringify` whole request
- [ ] Document corp model API key resolution (no `apiKeyEnv`, relies on fallback
      chain)
- [ ] Fix SDK `session.ts` — default to first available model when
      `OPENAI_COMPATIBLE` detected

### 7.3 Minor / Design

- [ ] Investigate `mapFinishReason('tool_calls') -> STOP` — may prevent tool
      execution trigger in geminiChat loop
- [ ] Handle or remove unused `custom` field on model configs
- [ ] Model persistence (save last selection to `~/.gemini/settings.json`) —
      also in Phase 6
- [ ] Document auth detection priority (OpenAI mode silently wins over
      GEMINI_API_KEY)
- [ ] Fix test isolation for global typeMapper state (resolved by
      ToolCallIdTracker from 7.1)
- [ ] Audit `turn.ts` fallback ID generation (`name_Date.now()_callCounter++`)
      vs typeMapper IDs

---

## Key Technical Notes

### Streaming Response Shape

Each `generateContentStream()` yield must be a valid `GenerateContentResponse`:

```typescript
{
  candidates: [{
    content: { parts: [{ text: "chunk" }], role: "model" },
    index: 0,
    finishReason: undefined  // or "STOP" on last chunk
  }],
  usageMetadata: { promptTokenCount: N, candidatesTokenCount: M }  // optional per-chunk
}
```

### Tool Call Flow (Bidirectional)

**Gemini → OpenAI (request):**

1. `request.config.tools[].functionDeclarations[]` →
   `tools: [{ type: "function", function: { name, description, parameters } }]`
2. History with `functionCall` parts → assistant message with `tool_calls`
3. History with `functionResponse` parts → tool role message with `tool_call_id`

**OpenAI → Gemini (response):**

1. `choices[0].message.tool_calls` →
   `candidates[0].content.parts[].functionCall { name, args: JSON.parse(arguments) }`

### What NOT to Change

- `geminiChat.ts`, `client.ts` — they consume ContentGenerator interface only
- Ink UI rendering — consumes StreamEvent wrapping GenerateContentResponse
- Existing auth types — new type is additive
- `packages/core/src/prompts/snippets.legacy.ts` — historical snapshot

### Files Created

| File                                                    | Purpose                                             |
| ------------------------------------------------------- | --------------------------------------------------- |
| `packages/core/src/config/llmRegistry.ts`               | TypeScript LLM registry (27 models, 3 environments) |
| `packages/core/src/core/openaiTypeMapper.ts`            | Gemini ↔ OpenAI type conversion                    |
| `packages/core/src/core/openaiContentGenerator.ts`      | ContentGenerator impl using OpenAI SDK              |
| `packages/core/src/config/llmRegistry.test.ts`          | Registry tests (15 tests)                           |
| `packages/core/src/core/openaiTypeMapper.test.ts`       | Type mapper tests (25 tests)                        |
| `packages/core/src/core/openaiContentGenerator.test.ts` | Content generator tests (9 tests)                   |
| `scripts/test_openai_adapter.sh`                        | Build/test/run script                               |

### Files Modified

| File                                         | Change                                                          |
| -------------------------------------------- | --------------------------------------------------------------- |
| `packages/core/src/core/contentGenerator.ts` | Added OPENAI_COMPATIBLE AuthType, env detection, factory branch |
| `packages/core/src/index.ts`                 | Export new modules                                              |
| `packages/core/package.json`                 | Added `openai` dependency                                       |
| `packages/cli/src/ui/auth/AuthDialog.tsx`    | Split into OpenAIModelPicker + GoogleAuthDialog                 |
| `packages/cli/src/core/initializer.ts`       | Skip Google auth in OpenAI mode                                 |
| `packages/cli/src/ui/auth/useAuth.ts`        | Skip Google auth effect in OpenAI mode                          |
