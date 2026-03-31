# TODO: Replace Auth with LLM Picker + OpenAI-Compatible API

## Overview

Replace the Gemini auth prompt with an LLM selection list. When user runs
`$ gemini`, show available models from `models.default.json`, let them pick
one, and connect via OpenAI Chat Completions API.

---

## Phase 0: Project Setup & Test Script

- [x] **Create `scripts/test_openai_adapter.sh`** — build+run script for
      iterative testing
  - Loads env vars from `~/.env`
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

  Loads models from `models.default.json` with all 27 models:
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
    `OPENROUTER_API_KEY`, `A2G_LOCATION`
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

- [x] Remember last selected model (save to `~/.gemini/settings.json`)
- [x] Show model details in selection list (context length, reasoning
      capability)
- [x] Handle connection errors gracefully (model unavailable, invalid API key)
- [x] Update `INSTALL_GUIDE.md` with OpenAI-compatible setup (Mode A/B, `set -a`
      for env export, troubleshooting section for common issues)
- [x] Create `docs/openai-compatible.md` with full documentation

---

## Phase 7: Bug Fixes & Stability

Findings from code scrutiny — 16 issues (3 critical, 7 medium, 6 minor).

### 7.1 Critical (cause real failures)

- [x] **Fix global mutable state in `openaiTypeMapper.ts`** — Replaced global
      `toolCallIdMap`/`toolCallCounter` with `ToolCallIdTracker` class. Each
      `OpenAIContentGenerator` instance now has its own tracker, passed to all
      mapper functions. Tests pass with no global state.

- [x] **Fix streaming tool calls dropped on `finish_reason: "stop"`** —
      `streamToAsyncGenerator()` now emits accumulated tool calls when
      `pendingToolCalls.size > 0` at end of stream, regardless of finish_reason.
      Added test verifying tool calls emitted with finish_reason "stop".

- [x] **Add `OPENAI_COMPATIBLE` to `validateAuthMethod()`** — Added early return
      `null` for `OPENAI_COMPATIBLE` in `packages/cli/src/config/auth.ts`. Added
      test. Non-interactive mode now works.

### 7.2 Medium (incorrect behavior)

- [x] Add `apiKeyEnv: 'OPENROUTER_API_KEY'` to `dev-claude-haiku-4.5-generic` in
      `llmRegistry.ts`
- [x] Defer GaussO `defaultHeaders` from module-load to factory-time — changed
      to a getter property on the model config so env vars are read when
      accessed, not at import time
- [x] Send `max_tokens` to OpenAI API — added `maxTokens` to
      `OpenAIContentGeneratorConfig`, wired from `modelConfig.maxTokens` in
      `contentGenerator.ts` factory
- [x] Fix `extraBody` spread ordering — `extraBody` now spread before explicit
      fields (`model`, `messages`, `stream`) so they cannot be overridden
- [x] Improve `countTokens()` — extracts text from parts instead of
      `JSON.stringify` on entire request
- [x] Document corp model API key resolution (no `apiKeyEnv`, relies on fallback
      chain) — added to `docs/openai-compatible.md` Corporate section
- [x] Fix SDK `session.ts` — defaults to first available model when
      `OPENAI_COMPATIBLE` detected

### 7.3 Minor / Design

- [x] Investigate `mapFinishReason('tool_calls') -> STOP` — NOT a bug.
      `geminiChat.ts` triggers tool execution from `resp.functionCalls` (parts),
      not from `finishReason`. Mapping to STOP is correct.
- [x] Handle or remove unused `custom` field on model configs — removed from
      `LLMModelConfig` interface and from `dev-claude-haiku-4.5-generic` and
      `claude-haiku-4.5` model definitions. Was Python-only metadata never read
      by TypeScript code.
- [x] Model persistence (save last selection to `~/.gemini/settings.json`) —
      completed in Phase 6 (`settingsSchema.ts`, `AuthDialog.tsx`,
      `initializer.ts`)
- [x] Document auth detection priority (OpenAI mode silently wins over
      GEMINI_API_KEY) — added detection order to `docs/openai-compatible.md`
- [x] Fix test isolation for global typeMapper state — resolved by
      `ToolCallIdTracker` class from 7.1. Each function creates a fresh tracker
      when none is provided; `OpenAIContentGenerator` uses a per-instance one.
- [x] Audit `turn.ts` fallback ID generation (`name_Date.now()_callCounter++`)
      vs typeMapper IDs — NOT a conflict. OpenAI responses always include
      `tool_call_id` which the mapper preserves in `functionCall.id`. The
      fallback in `turn.ts:412` only triggers for Gemini-native responses (which
      don't use tool_call_id). No collision possible.

---

## Phase 8: GLM-5 Streaming Tool Call Fix

- [x] **Diagnosed GLM-5 tool-calling loop** — Both GLM-5-Thinking and
      GLM-5-Non-Thinking entered infinite tool-call loops on CORP vLLM endpoint.
      Other models (KIMI, Qwen, gpt-oss-120b) worked fine.

- [x] **Root cause: vLLM/GLM-5 sends duplicate streaming tool call chunks** —
      During streaming, vLLM sends two chunks for the same tool call index, both
      with `tc.id` set. The accumulator was blindly concatenating arguments,
      producing garbled JSON like `{"command":"date"{"command": "date"}`. When
      `JSON.parse` failed, args became `{}`, the model got meaningless results,
      and re-requested the same tool → loop detection fired.

- [x] **Fix 1 (primary): Replace instead of append when `tc.id` is set** — In
      `openaiContentGenerator.ts` `streamToAsyncGenerator()`, when a streaming
      chunk has `tc.id` set for an existing tool call index, replace the entry
      instead of appending. Per OpenAI spec, `tc.id` is only set on the first
      chunk of a tool call; if vLLM sends it again, it's a new/duplicate call.

- [x] **Fix 2 (safety net): `sanitizeToolCallArgs()` helper** — Validates
      accumulated JSON. If invalid, tries to extract the last valid JSON object
      from the string. Falls back to `{}` with a warning log.

- [x] **Created `scripts/test_glm5_tools.py`** — Standalone Python test for
      multi-turn tool calling via OpenAI API. Confirmed non-streaming works
      perfectly, streaming had the argument duplication bug. Applied same fix
      logic in the Python test.

- [x] **Debug logging added** — `openaiContentGenerator.ts` now logs messages
      sent to API and streaming chunks via `debugLogger` (visible with `--debug`
      flag or `GEMINI_DEBUG_LOG_FILE` env var).

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

---

## Phase 9: Sandbox in YOLO Mode

When `gemini --yolo` is run, the CLI should automatically isolate tool execution
inside a Docker/Podman container. If no container runtime is available, continue
gracefully without sandbox. All API keys, env vars, and fork code must work
inside the container exactly as they do outside.

### 9.1 Sandbox Auto-Enable

- [x] **`sandboxConfig.ts` — `bestEffort` parameter**
  - `getSandboxCommand(sandbox, bestEffort)` and
    `loadSandboxConfig(settings, argv, bestEffort)`
  - When `bestEffort=true` and no Docker/Podman found → return `''` (no crash)
  - When `bestEffort=false` (default) → throw `FatalSandboxError` (explicit
    request honored)

- [x] **`config.ts` — YOLO detection and auto-enable**
  - Capture `yoloRequested` flag **before** folder trust check can downgrade
    `approvalMode` from YOLO to DEFAULT
  - If YOLO was requested and user did NOT explicitly configure sandbox
    (`--sandbox`, `GEMINI_SANDBOX`, `settings.tools.sandbox` all absent), call
    `loadSandboxConfig()` with `sandbox: true, bestEffort: true`
  - Behavior matrix: | Scenario | bestEffort | Result | |---|---|---| | `--yolo`
    (no sandbox config) | true | Auto-detect; if none found, continue | |
    `--yolo --sandbox` | false | Auto-detect; throw if none found | |
    `--yolo --sandbox=false` | false | No sandbox (user opted out) | | No
    `--yolo` | false | No change from existing behavior |

- [x] **`gemini.tsx` — Matching YOLO detection for process re-launch**
  - `gemini.tsx` has its own `loadSandboxConfig()` call (for Docker re-launch).
    Added the same YOLO detection logic here so the sandbox actually starts.

### 9.2 YOLO Bypasses Folder Trust

- [x] **`config.ts` — Explicit `--yolo` is never silently downgraded**
  - Before: untrusted folders override `approvalMode` from YOLO to DEFAULT
  - After: `if (!trustedFolder && !yoloRequested)` — YOLO stays YOLO

### 9.3 Footer Sandbox Indicator

- [x] **`Footer.tsx` — Show sandbox status before entering container**
  - `SandboxIndicator` now accepts `configuredSandbox` prop from
    `config.getSandbox()?.command`
  - Previously only checked `process.env['SANDBOX']` (set inside container), so
    "no sandbox" was shown before the container launched

### 9.4 Env Var Forwarding into Docker

- [x] **`sandbox.ts` — Mount a2g env file read-only**
  - Mounts `~/.env` (or `$A2G_ENV_FILE`) to `/tmp/.a2g_env` inside the container
  - Sets `A2G_ENV_FILE=/tmp/.a2g_env` env var in the container
  - Also forwards `NODE_TLS_REJECT_UNAUTHORIZED` for on-prem endpoints

- [x] **`sandboxUtils.ts` — Source env file in entrypoint**
  - Added
    `if [ -f "$A2G_ENV_FILE" ]; then set -a; source "$A2G_ENV_FILE"; set +a; fi`
    to the entrypoint shell commands
  - All `API key` API keys, `A2G_LOCATION`, etc. are available inside the
    container without listing them individually

### 9.5 Run Fork Code Inside Docker

- [x] **`sandboxUtils.ts` — Detect local clone and use `node <path>`**
  - When `cliArgs[1]` resolves (via `fs.realpathSync`) to a path containing
    `packages/cli`, use `node <containerized-path>` instead of the container
    image's `gemini` binary
  - Resolving symlinks is critical: `npm link` creates a symlink at
    `~/.npm-global/bin/gemini` → `packages/cli/dist/index.js`. Without
    resolving, the symlink path doesn't contain `packages/cli` and the container
    falls back to the image's built-in `gemini` (which is the unmodified version
    with no OpenAI-compatible mode)
  - Prevents the container from running a different version

- [x] **`sandbox.ts` — Mount fork repo volume with symlink resolution**
  - When running from a different working directory (e.g.
    `cd /some/project && gemini --yolo`), the fork repo is mounted read-only so
    `node packages/cli/dist/index.js` works inside the container
  - Uses `fs.realpathSync` to resolve `npm link` symlinks before checking if the
    script path is under the working directory

### 9.6 Tests

- [x] **`sandboxConfig.test.ts`** — 4 bestEffort tests:
  - Returns `undefined` (not throw) when no runtime and `bestEffort=true`
  - Still returns config when runtime available and `bestEffort=true`
  - Still throws when `bestEffort=false`
  - Uses `sandbox-exec` on darwin even with `bestEffort`

- [x] **`config.test.ts`** — 7 YOLO sandbox tests:
  - `--yolo` calls `loadSandboxConfig` with `bestEffort=true`
  - `--yolo --sandbox` does NOT use bestEffort
  - `--yolo --sandbox=false` does NOT auto-enable
  - `GEMINI_SANDBOX` env var does NOT trigger bestEffort
  - `settings.tools.sandbox` does NOT trigger bestEffort
  - `--yolo` in untrusted folder still auto-enables sandbox
  - No YOLO → no auto-enable

### 9.7 Files Modified

| File                                            | Change                                 |
| ----------------------------------------------- | -------------------------------------- |
| `packages/cli/src/config/sandboxConfig.ts`      | `bestEffort` parameter                 |
| `packages/cli/src/config/config.ts`             | YOLO auto-enable, folder trust bypass  |
| `packages/cli/src/gemini.tsx`                   | YOLO auto-enable for process re-launch |
| `packages/cli/src/ui/components/Footer.tsx`     | `configuredSandbox` prop               |
| `packages/cli/src/utils/sandbox.ts`             | Env file mount, fork repo volume       |
| `packages/cli/src/utils/sandboxUtils.ts`        | Env sourcing, local clone detection    |
| `packages/cli/src/config/sandboxConfig.test.ts` | 4 bestEffort tests                     |
| `packages/cli/src/config/config.test.ts`        | 7 YOLO sandbox tests                   |

---

## Phase 10: Multi-Turn Fix (Premature Stop + Silent Response)

**Status: COMPLETE**

Two issues reported with KIMI and other OpenAI-compatible models:

1. Model stops after one tool call when it should continue (premature stopping)
2. Model sometimes returns empty/no response (silent response)

### 10.1 Enable nextSpeakerCheck by default

- [x] **`packages/core/src/config/config.ts`**: Change `skipNextSpeakerCheck`
      default from `true` to `false`
  - Enables auto-continuation for all model types after tool call responses
  - Users can still disable via `settings.model.skipNextSpeakerCheck: true`
- [x] **`packages/core/src/core/client.ts`**: Gate `nextSpeakerCheck` on
      `isToolResponseTurn`
  - **Bug fix**: nextSpeakerCheck was firing for ALL text responses, causing
    infinite "Please continue." loops on simple "Hello" messages
  - Now only fires when the request contains `functionResponse` parts (model
    responding to tool results)
  - Prevents loop: functionResponse → text → continue("Please continue.") → text
    → **stop** (no functionResponse in "Please continue." request)

### 10.2 Support `response_format` in OpenAI adapter + yield stop chunks

- [x] **`packages/core/src/core/openaiContentGenerator.ts`**: Add
      `response_format: { type: 'json_object' }` when
      `responseMimeType === 'application/json'`
  - Makes `baseLlmClient.generateJson()` work for OpenAI models (used by
    nextSpeakerCheck, editCorrector, etc.)
- [x] **`packages/core/src/core/openaiContentGenerator.ts`**: Yield stop-only
      chunks in `streamToAsyncGenerator`
  - **Bug fix**: OpenAI sends `finish_reason: 'stop'` in a separate chunk with
    no content; this chunk was dropped, causing `geminiChat` to throw
    `InvalidStreamError('NO_FINISH_REASON')` → retry + recovery → 4+ duplicate
    responses
  - Fix: yield chunks when `choice.finish_reason` is set (and no tool_calls) so
    `finishReason` is captured

### 10.3 Enable retry for empty responses from all models

- [x] **`packages/core/src/core/geminiChat.ts`**: Remove `isGemini2Model` gate
      on `InvalidStreamError` retry
  - All models now get 1 retry (500ms delay) for empty/invalid stream responses
  - Also ungated the retry failure logging

### 10.4 Enable "Please continue" recovery for all models

- [x] **`packages/core/src/core/client.ts`**: Remove `isGemini2Model` gate on
      `continueOnFailedApiCall`
  - After retries exhausted, sends "System: Please continue." for all model
    types

### 10.5 UI feedback for InvalidStream events

- [x] **`packages/cli/src/ui/hooks/useGeminiStream.ts`**: Replace empty handler
      with info message
  - Shows "Model returned an empty response. Retrying..." instead of silent
    failure

### 10.6 Tests

- [x] **`openaiContentGenerator.test.ts`**: 2 new tests for `response_format`
      (present when JSON requested, absent otherwise)
- [x] **`geminiChat.test.ts`**: Updated test to verify retry fires for
      non-Gemini-2 models
- [x] **`client.test.ts`**: Updated test to verify "Please continue." recovery
      fires for non-Gemini-2 models
- [x] All core tests pass (299 files, 5590 tests)
- [x] useGeminiStream tests pass (72 tests)

### 10.7 Files Modified

| File                                                    | Change                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `packages/core/src/config/config.ts`                    | Default `skipNextSpeakerCheck` to `false`                                                  |
| `packages/core/src/core/openaiContentGenerator.ts`      | Add `response_format` support                                                              |
| `packages/core/src/core/geminiChat.ts`                  | Remove `isGemini2Model` gate on retry                                                      |
| `packages/core/src/core/client.ts`                      | Remove `isGemini2Model` gate on recovery + gate `nextSpeakerCheck` on `isToolResponseTurn` |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | Add InvalidStream UI feedback                                                              |
| `packages/core/src/core/openaiContentGenerator.test.ts` | 2 new response_format tests                                                                |
| `packages/core/src/core/geminiChat.test.ts`             | Updated retry test for all models                                                          |
| `packages/core/src/core/client.test.ts`                 | Updated recovery test for all models                                                       |

---

## Phase 10.3: Korean IME Character Drop Fix

**Status: COMPLETE**

When typing Korean (or other IME-composed languages), the last character was
dropped on submit. Two root causes:

1. **Stdin char ordering**: Some terminals send `\r` (Enter) before the
   IME-committed character in a single `data` event (e.g. `"\r니"`), so the
   submit fires before the character is inserted.
2. **React state timing**: `useReducer` dispatch runs the reducer synchronously
   but the state binding is stale in the same tick, so the submit handler reads
   stale text.

- [x] **`packages/cli/src/ui/contexts/KeypressContext.tsx`**: Reorder `\r`/`\n`
      before non-ASCII chars (> U+007F) in `createDataListener` so IME-committed
      chars are processed before Enter. Only non-ASCII triggers reorder to avoid
      affecting normal paste text.
- [x] **`packages/cli/src/ui/components/shared/text-buffer.ts`**: Add `useRef`
      import, `latestLinesRef` synced inside reducer wrapper, `getLatestText()`
      function that reads directly from the ref
- [x] **`packages/cli/src/ui/components/shared/text-buffer.ts`**: Add
      `getLatestText` to `TextBuffer` interface and `returnValue` object
- [x] **`packages/cli/src/ui/components/InputPrompt.tsx`**: Change all
      `handleSubmit(buffer.text)` → `handleSubmit(buffer.getLatestText())`
- [x] **`packages/cli/src/ui/components/InputPrompt.test.tsx`**: Add
      `getLatestText` mock to `mockBuffer`
- [x] All KeypressContext tests pass (127 tests)
- [x] All text-buffer tests pass (219 tests)
- [x] All InputPrompt tests pass (189 tests)

---

## Phase 10.4: Premature Stopping Fix (nextSpeakerCheck null default)

**Status: COMPLETE**

After tool-response turns, `checkNextSpeaker()` makes a separate LLM call to
decide if the model should continue. When this call fails (returns `null` —
timeout, malformed JSON, network error), the system silently stopped the model,
forcing users to say "keep going" to resume.

- [x] **`packages/core/src/core/client.ts`**: MAX_TOKENS auto-continue
  - When `turn.finishReason` is `MAX_TOKENS`, bypass `checkNextSpeaker` entirely
    and auto-continue — the model was cut off mid-response
- [x] **`packages/core/src/core/client.ts`**: Null defaults to continue
  - When `checkNextSpeaker` returns `null` (LLM check failed), default to
    continuing instead of stopping
  - Safe due to `boundedTurns` limit (MAX_TURNS = 100) preventing infinite loops
  - Previous behavior: `null` → stop (model goes silent, user must say
    "continue")
  - New behavior: `null` → continue (model keeps working, bounded by turn limit)
- [x] All client.ts tests pass (79 tests)
- [x] All nextSpeakerChecker tests pass (10 tests)

---

## Phase 10.5: GLM-5 max_tokens = contextLength Fix

**Status: COMPLETE**

GLM-5 failed on first message with
`API Error: 400 ... context length is only 157248 tokens, resulting in a maximum input length of 248 tokens`.
Even "hello" was too long.

**Root cause:** The model registry sets
`max_tokens = context_length` for open-source LLMs (GLM-5, KIMI, Qwen, DeepSeek,
etc.) because these models have no distinct output limit — the value represents
the context window size. The Python wrapper intentionally does NOT pass this to
the API. But our TypeScript code was passing it directly as the OpenAI
`max_tokens` parameter, which tells vLLM to reserve the entire context for
output (157,000 of 157,248 tokens), leaving only 248 tokens for input.

- [x] **`packages/core/src/core/contentGenerator.ts`**: `safeMaxTokens` guard
  - When `maxTokens >= contextLength`, don't pass `max_tokens` to the API
  - Affected models (all corp + some dev): GLM-5, KIMI, Qwen, gpt-oss-120b,
    GaussO, DeepSeek
  - Unaffected models (real output limits): gpt-4o (16k/128k), gpt-5
    (128k/400k), claude-haiku (64k/200k)
- [x] All contentGenerator tests pass (20 tests)

---

## Phase 10.6: OpenAI Tool Name Sanitization Fix

**Status: COMPLETE**

OpenAI models (via OpenRouter, direct API) failed with
`400 Invalid 'tools[N].function.name': string does not match pattern '^[a-zA-Z0-9_-]+$'`.
Tool names containing dots (`.`) or colons (`:`) are valid for Gemini's API but
rejected by OpenAI.

**Root cause:** `generateValidName()` in `mcp-tool.ts` sanitizes names for
Gemini's pattern `^[a-zA-Z_][a-zA-Z0-9_\-.:]{0,63}$` which allows dots and
colons. When these names flow through `geminiToolsToOpenAITools()` in
`openaiTypeMapper.ts`, they're sent as-is to OpenAI which only allows
`[a-zA-Z0-9_-]`.

- [x] **`packages/core/src/core/openaiTypeMapper.ts`**: Added `sanitizeName()` /
      `restoreName()` to `ToolCallIdTracker`
  - Replaces any char not in `[a-zA-Z0-9_-]` with `_` when sending to OpenAI
  - Stores reverse mapping to restore original Gemini names on responses
  - Applied in: `geminiToolsToOpenAITools()`, `partsFunctionCalls()`, response
    converters
- [x] **`packages/core/src/core/openaiContentGenerator.ts`**: Passes tracker to
      `geminiToolsToOpenAITools()`
- [x] All openaiTypeMapper tests pass (26 tests, +1 new for sanitization)

---

## Phase 10.7: OpenAI Tool Schema Fix (parametersJsonSchema)

**Status: COMPLETE**

OpenAI models called tools with wrong parameter names (e.g. `path` instead of
`file_path`, empty `{}` for required params) because the model received **empty
schemas** with no parameter definitions.

**Root cause:** Tool definitions use `parametersJsonSchema` (standard JSON
Schema format) but `geminiToolsToOpenAITools()` only read `fd.parameters`
(legacy Gemini Schema format), which was `undefined` for all tools. The fallback
was `{ type: 'object', properties: {} }` — an empty schema with no parameters.

- [x] **`packages/core/src/core/openaiTypeMapper.ts`**: Read
      `fd.parametersJsonSchema ?? fd.parameters` instead of just `fd.parameters`
  - Now the full JSON Schema (property names, types, required fields,
    descriptions) is sent to OpenAI
- [x] All openaiTypeMapper tests pass (27 tests, +1 new for
      parametersJsonSchema)

---

## Phase 11: Upstream Sync Infrastructure

**Status: COMPLETE**

Established infrastructure for smooth, repeatable upstream syncing. No actual
merge execution — that's deferred to a future session.

### 11.1 Documentation

- [x] **Created `docs/fork/upstream-merge-plan.md`** — permanent reference with
      divergence state, merge strategy (merge not rebase), step-by-step process,
      conflict resolution table per file, rules going forward, complete file
      manifest
- [x] **Created `docs/fork/fork-vs-upstream-comparison.md`** — side-by-side
      comparison (purpose, auth, models, API layer, sandbox, IME, multi-turn),
      architecture diagram, file-by-file modification inventory with conflict
      risk

### 11.2 Pre-merge Refactoring (reduce conflict surface)

- [x] **Extracted `openaiFactory.ts`** from `contentGenerator.ts`
  - `detectOpenAIMode()`, `isOpenAIAuthConfig()`,
    `createOpenAIContentGenerator()`
  - `contentGenerator.ts` fork changes: ~44 lines → ~8 lines (3 small
    conditionals + 1 import)
- [x] **Extracted `openaiInitializer.ts`** from `initializer.ts`
  - `tryOpenAIAutoConnect(config, settings)` → returns boolean
  - `initializer.ts` fork changes: ~20 lines → ~6 lines
- [x] **Extracted `OpenAIModelPicker.tsx`** from `AuthDialog.tsx`
  - Moved ~130-line component to its own file
  - `AuthDialog.tsx` fork changes: ~130 lines → 5-line conditional + 1 import
- [x] **Added `// [FORK]` markers** to all fork changes in 19 upstream files
  - Makes conflict resolution fast: search for `[FORK]` to find all fork code
- [x] **Updated `packages/core/src/index.ts`** — added `openaiFactory.ts` export

### 11.3 Sync Automation Scripts

- [x] **`scripts/upstream-sync.sh`** — main workflow: add upstream remote,
      fetch, backup tag, show commits to merge, conflict surface analysis,
      instructions
- [x] **`scripts/verify-fork-features.sh`** — post-merge verification: checks
      fork files exist, markers present, build/typecheck/test pass
- [x] **`scripts/fork-diff-report.sh`** — pre-merge analysis: files modified on
      both sides, change magnitude, fork markers

### 11.4 Project Docs Updated

- [x] **`CLAUDE.md`** — added upstream sync section, updated file tables
- [x] **`docs/fork/todo.md`** — added this phase entry

### 11.5 Files Created

| File                                             | Purpose                         |
| ------------------------------------------------ | ------------------------------- |
| `docs/fork/upstream-merge-plan.md`               | Merge strategy and checklist    |
| `docs/fork/fork-vs-upstream-comparison.md`       | Fork vs upstream comparison     |
| `packages/core/src/core/openaiFactory.ts`        | OpenAI factory (extracted)      |
| `packages/cli/src/core/openaiInitializer.ts`     | OpenAI auto-connect (extracted) |
| `packages/cli/src/ui/auth/OpenAIModelPicker.tsx` | Model picker (extracted)        |
| `scripts/upstream-sync.sh`                       | Sync workflow                   |
| `scripts/verify-fork-features.sh`                | Post-merge verification         |
| `scripts/fork-diff-report.sh`                    | Pre-merge conflict analysis     |

### 11.6 Files Modified

| File                                         | Change                                             |
| -------------------------------------------- | -------------------------------------------------- |
| `packages/core/src/core/contentGenerator.ts` | Slimmed to ~8 fork lines (import + 3 conditionals) |
| `packages/cli/src/core/initializer.ts`       | Slimmed to ~6 fork lines (import + call)           |
| `packages/cli/src/ui/auth/AuthDialog.tsx`    | Slimmed to 5-line conditional + import             |
| `packages/core/src/index.ts`                 | Added openaiFactory export                         |
| 19 upstream files                            | Added `// [FORK]` comment markers                  |
| `CLAUDE.md`                                  | Added upstream sync section                        |

---

## Phase 12: Upstream Merge (fc03891a1)

- [x] **Merged upstream/main (fc03891a1)** — resolved 11 conflicting files
- [x] `package-lock.json` — deleted and regenerated
- [x] `README.md` — took upstream (fork README in docs/fork/)
- [x] `InputPrompt.tsx` — merged imports (kept `fs` for IME debug)
- [x] `client.ts` — took upstream imports (`getDisplayString`, `resolveModel`);
      removed unused `isGemini2Model`
- [x] `gemini.tsx` — removed duplicate import block, added `getAuthTypeFromEnv`
      to first import
- [x] `sandboxConfig.ts` — upstream object parsing + fork `bestEffort`; updated
      tests for new return shape
- [x] `config.ts` — fork YOLO auto-sandbox + upstream
      `allowedPaths`/`networkAccess` config (sequential)
- [x] `config.test.ts` — kept both test suites (YOLO sandbox + ACP mode)
- [x] `sandbox.ts` — deduplicated env vars, kept upstream `allowedPaths` LXC
      mounting, added `NODE_TLS_REJECT_UNAUTHORIZED`
- [x] `geminiChat.ts` — fork retry-all + upstream `MID_STREAM_RETRY_OPTIONS` +
      abort check
- [x] `geminiChat.test.ts` — updated to 4 calls (MID_STREAM maxAttempts) + both
      retry/failure assertions
- [x] `packages/core/index.ts` — took upstream's `./src/index.js` re-export
      pattern
- [x] `packages/core/src/index.ts` — added `openaiFactory` export
- [x] Deduped `@grpc/grpc-js` version mismatch
- [x] Build passes, all targeted tests pass, fork features verified

---

## Phase 13: Generalize Upstream Sync Process

- [x] **Consolidated two overlapping docs into one** — `upstream-merge-plan.md`
      (stale one-off snapshot) folded into `upstream-sync-guide.md` (single
      source of truth). Deleted `upstream-merge-plan.md`.
- [x] **Rewrote `upstream-sync.sh`** — now targets stable release tags only
      (`vX.Y.Z`, no `-preview`/`-nightly`). Reads last synced version from
      `merge-history.md`, exits early if already up to date. Added `--force`
      flag.
- [x] **Created `merge-history.md`** — persistent log of every merge with backup
      tags, upstream versions, conflict counts. Seeded with Phase 12 entry.
- [x] **Updated `upstream-sync-guide.md`** — added Quick Summary, Strategy
      section, beginner-friendly conflict resolution walkthrough with examples,
      per-file conflict resolution table, rules.
- [x] **Updated CLAUDE.md** — references now point to `upstream-sync-guide.md`
      and `merge-history.md`.
- [x] **Rewrote `README.md`** — now reflects fork identity: model picker,
      supported models, env config, architecture diagram, fork features, docs
      index.

---

## Phase 10: Lightweight Python LLM Helper (COMPLETE)

Goal: Let coworkers use models from `models.default.json` with vanilla
`langchain_openai.ChatOpenAI` — no proprietary dependencies.

- [x] **Created `scripts/fork/gemini_llm.py`** — single-file helper with
      `from_model()` and `list_models()`. Handles env detection, API key
      resolution, model alias mapping, `__corp_auth__` headers, `extra_body`.
      Only dependency: `pip install langchain-openai`.
- [x] **Live tested** — gpt-4o-mini invoke, stream, and kwargs all pass.
- [x] **Removed all `a2g_models` references** — deleted `on_prem_llms_test/`
      directory, `export_llm_registry.py`. Updated CLAUDE.md, README.md,
      openaiFactory.ts, OpenAIModelPicker.tsx, test_openai_adapter.sh,
      dynamic-model-loading.md, model-registry-reference.md.
- [x] **Updated test script** — `do_list_models()` and `do_python_test()` in
      `test_openai_adapter.sh` now use `gemini_llm.py` instead of deleted scripts.

See `phase10-todo.md` for full details.

---

## Phase 10.5: Multi-Provider Routing + API Key Inference (COMPLETE)

Goal: Route models to native LangChain classes by provider, and auto-detect
the correct API key from the model URL (no more hardcoded `OPENAI_API_KEY`
fallback).

- [x] **Multi-provider routing in `gemini_llm.py`** — `from_model()` now returns
      `ChatOpenAI`, `ChatAnthropic`, or `ChatOpenRouter` based on URL. Lazy
      imports so coworkers only install the package(s) they need.
- [x] **URL-based API key inference in `openaiFactory.ts`** — added
      `inferDefaultApiKeyEnv(url)`: `anthropic.com` -> `ANTHROPIC_API_KEY`,
      `openrouter.ai` -> `OPENROUTER_API_KEY`, fallback -> `OPENAI_API_KEY`.
      Fixes 401 error when selecting Anthropic models in the CLI.
- [x] **Added `apiKeyEnv` to Anthropic models in `models.default.json`** —
      explicit `ANTHROPIC_API_KEY` for Claude models.
- [x] **Live tested all three providers** — OpenAI, Anthropic, OpenRouter
      invoke + stream confirmed working in both Python helper and TypeScript CLI.

See `phase10.5-todo.md` for full details.

---

## Phase 11: Langfuse Telemetry (On-Prem)

Leverages the upstream's existing OpenTelemetry pipeline to send traces to a
self-hosted Langfuse instance. Auto-configures from `LANGFUSE_*` env vars — no
new dependencies, just smart defaults on top of existing OTLP exporters.

- [x] **Config layer** — added `otlpHeaders`, `langfuse` to `TelemetrySettings`,
      getters to `Config` class.
- [x] **Langfuse auto-detection** — `resolveTelemetrySettings()` detects
      `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY`, auto-configures endpoint,
      protocol (HTTP), and auth headers. Explicit `GEMINI_TELEMETRY_*` vars
      always take precedence.
- [x] **OTLP exporters** — HTTP exporters pass custom headers. `NoopLogExporter`
      for Langfuse (no `/v1/logs` support). Explicit `forceFlush()` before
      shutdown for short-lived `-p` mode.
- [x] **Langfuse display quality** — `langfuse.observation.input/output` in
      LangChain-style `[{"type":"text","text":"..."}]` format (multimodality-
      ready). Streaming chunks concatenated. Trace name: `gemini-cli:{model}`.
- [x] **`-m` flag fix** — `tryOpenAIAutoConnect()` now respects CLI `-m` flag,
      overriding saved model from settings.
- [x] **Documentation** — dedicated `telemetry.md`, cross-ref in
      `openai-compatible.md`, env vars in `CLAUDE.md`.
- [x] **Build & test** — file export, Langfuse OTLP, `-m` flag, display quality
      all verified.

See `phase11-plan.md` and `phase11-todo.md` for full details.
