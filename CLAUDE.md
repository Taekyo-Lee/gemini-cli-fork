# Gemini CLI Fork — Claude Code Project Context

## Fork Purpose

This is a fork of [Google's Gemini CLI](https://github.com/GoogleCloudPlatform/gemini-cli) customized to support **on-prem LLMs** (KIMI, DeepSeek, GLM, Qwen, etc.) and public OpenAI-compatible APIs via the **a2g_models** registry. Instead of prompting for Google authentication on startup, the CLI should display a **model picker** showing all available LLMs and connect via OpenAI-compatible endpoints.

**Key behavior change:** `$ gemini` → shows LLM selection list (not auth prompt) → connects to selected model via OpenAI Chat Completions API.

## Architecture

Monorepo using npm workspaces:

| Package | Purpose |
|---------|---------|
| `packages/cli` | Terminal UI (React + Ink), argument parsing (yargs), entry point |
| `packages/core` | Backend: LLM orchestration, prompt construction, tool execution, config |
| `packages/a2a-server` | Experimental Agent-to-Agent server |
| `packages/sdk` | SDK package |
| `packages/vscode-ide-companion` | VS Code extension |
| `packages/devtools` | Developer tooling |
| `packages/test-utils` | Shared test utilities |

**Runtime:** Node.js >= 20 | **Language:** TypeScript (strict) | **UI:** React + Ink | **Testing:** Vitest | **Bundling:** esbuild

---

## The a2g_models LLM Registry (Source of Truth)

The Python `a2g_models` package at `~/workspace/main/research/a2g_packages/src/a2g_models/` defines all available LLMs. Our TypeScript registry must mirror this data.

### Registry Architecture

```
a2g_models/registries/llm_registries.py    → LLMRegistry class (company + dev models)
a2g_models/registries/default_registries/default_llm_registries.py → default_llm_models (OpenAI + Anthropic)
a2g_models/registries/base_registry.py     → ModelRegistry base class (env filtering)
a2g_models/configurations/llm_configurations.py → LLMConfig Pydantic model
a2g_models/utils/utils.py                  → detect_location() function
```

### LLMConfig Fields (Python → TypeScript mapping needed)

```python
class LLMConfig(BaseModel):
    model: str                          # Model name/identifier
    model_alias: Optional[str]          # Actual model name sent to API (e.g., 'deepseek/deepseek-v3.2')
    url: str                            # API endpoint URL (e.g., 'https://openrouter.ai/api/v1')
    modality: Optional[dict]            # {"input": ["text", "image"], "output": ["text"]}
    api_key_env: Optional[str]          # Env var name for API key (e.g., 'PROJECT_OPENROUTER_API_KEY')
    context_length: int                 # Max context window
    max_tokens: int                     # Max output tokens
    corp: bool                          # Available in CORPORATE environment
    home: bool                          # Available in HOME environment
    dev: bool                           # Available in DEV environment
    supports_responses_api: bool        # Supports OpenAI Responses API
    reasoning_model: bool               # Is a reasoning model
    extra_body: dict                    # Provider-specific params (e.g., {"reasoning": {"enabled": True}})
    default_headers: dict               # Custom HTTP headers
    custom: Optional[CustomModelConfig] # For custom endpoint routing
```

### Environment Detection

`detect_location()` in `a2g_models/utils/utils.py` (lines 69-114):
1. Check `PROJECT_A2G_LOCATION` env var → "COMPANY"/"PRODUCTION"/"CORP" → `CORP`; "DEVELOPMENT"/"DEV" → `DEV`; "HOME" → `HOME`
2. Check hostname for patterns ('prod', 'company', 'server') → `CORP`
3. Default → `HOME`

### Complete Model Registry

**Corporate (on-prem, corp=True, home=False, dev=False):**
All use `http://a2g.samsungds.net:7620/v1` except GaussO.

| Name | context_length | max_tokens | Modality | Notes |
|------|---------------|------------|----------|-------|
| GLM-5-Thinking | 157000 | 157000 | text | reasoning |
| GLM-5-Non-Thinking | 157000 | 157000 | text | reasoning |
| Kimi-K2.5-Thinking | 262000 | 262000 | text+image+video | reasoning |
| Kimi-K2.5-Non-Thinking | 262000 | 262000 | text+image+video | reasoning |
| Qwen3.5-35B-A3B | 128000 | 128000 | text+image | reasoning |
| Qwen3.5-122B-A10B | 262000 | 262000 | text+image | reasoning |
| gpt-oss-120b | 262000 | 262000 | text+image | reasoning |
| GaussO-Owl-Ultra-Instruct | 128000 | 128000 | text | url: `http://apigw.samsungds.net:8000/...`, custom headers |

**Dev/Home (OpenRouter, corp=False, home=True, dev=True):**
All use `https://openrouter.ai/api/v1`, api_key_env=`PROJECT_OPENROUTER_API_KEY`.

| Name | model_alias | context_length | max_tokens | extra_body |
|------|-------------|---------------|------------|------------|
| dev-DeepSeek-V3.2 | deepseek/deepseek-v3.2 | 128000 | 128000 | reasoning: true |
| dev-DeepSeek-V3.2-non-reasoning | deepseek/deepseek-v3.2 | 128000 | 128000 | reasoning: false |
| dev-claude-haiku-4.5 | anthropic/claude-haiku-4.5 | 200000 | 64000 | — |
| dev-claude-haiku-4.5-generic | anthropic/claude-haiku-4.5 | 200000 | 64000 | custom endpoint |
| dev-Gemini-3.1-Pro-Preview | google/gemini-3.1-pro-preview | 1000000 | 64000 | reasoning: true |
| dev-Claude-Opus-4.6 | anthropic/claude-opus-4.6 | 1000000 | 128000 | reasoning: true |

**Default Models (OpenAI direct, corp=False, home=True, dev=True):**
All use `https://api.openai.com/v1`, api_key_env=`PROJECT_OPENAI_API_KEY` (implicit).

| Name | context_length | max_tokens | supports_responses_api |
|------|---------------|------------|----------------------|
| gpt-4o | 128000 | 16384 | true |
| gpt-4o-mini | 128000 | 16384 | true |
| gpt-4.1 | 1047576 | 32768 | true |
| gpt-4.1-mini | 1047576 | 32768 | true |
| gpt-4.1-nano | 1047576 | 32768 | true |
| o1 | 200000 | 100000 | true (reasoning) |
| o3-mini | 128000 | 100000 | true (reasoning) |
| o4-mini | 200000 | 100000 | true (reasoning) |
| gpt-5 | 400000 | 128000 | true (reasoning) |
| gpt-5-nano | 400000 | 128000 | true (reasoning) |
| gpt-5-mini | 400000 | 128000 | true (reasoning) |
| gpt-5.2 | 400000 | 128000 | true (reasoning) |

**Anthropic (custom class, not ChatOpenAI):**
| Name | model_alias | url | Notes |
|------|-------------|-----|-------|
| claude-haiku-4.5 | claude-haiku-4-5 | https://api.anthropic.com/v1 | custom=CHAT_ANTHROPIC |

### Env File Location

`~/workspace/main/research/a2g_packages/envs/.env` — contains API keys:
- `PROJECT_OPENAI_API_KEY`, `PROJECT_OPENAI_API_BASE`
- `PROJECT_ANTHROPIC_API_KEY`, `PROJECT_ANTHROPIC_API_BASE`
- `PROJECT_OPENROUTER_API_KEY`, `PROJECT_OPENROUTER_API_BASE`
- `PROJECT_LITE_LLM_KEY`, `PROJECT_LITE_URL`
- `PROJECT_AD_ID`, `PROJECT_FALLBACK_API_KEY_1/2` (corp auth)
- `PROJECT_A2G_LOCATION` (environment detection)

---

## Reference Python Scripts (Entry Points)

These scripts in `on_prem_llms_test/` use the Python `a2g_models` registry and serve as the reference for the TypeScript implementation.

| Script | Purpose |
|--------|---------|
| `on_prem_llms_test/list_available_llms.py` | Lists all available LLMs for the current environment. **This is the UX the Gemini CLI model picker should replicate.** |
| `on_prem_llms_test/llm_test.py` | Sends a "hello" prompt to a model and verifies response. **Use this to verify the OpenAI adapter works end-to-end.** |

**Run commands:**
```bash
# List available models (sanity check — model picker should match this output)
uv run --native-tls --active --env-file ~/workspace/main/research/a2g_packages/envs/.env on_prem_llms_test/list_available_llms.py

# Test a model end-to-end (send "hello", verify response)
uv run --native-tls --active --env-file ~/workspace/main/research/a2g_packages/envs/.env on_prem_llms_test/llm_test.py
```

---

## Startup / Auth Flow (Current — to be replaced)

### Call Chain

1. **`packages/cli/index.ts`** → calls `main()`
2. **`packages/cli/src/gemini.tsx:328`** → `main()` function
3. **`packages/core/src/core/initializer.ts:37-70`** → `initializeApp()`, calls `performInitialAuth()`, returns `shouldOpenAuthDialog: boolean`
4. **`packages/core/src/core/auth.ts:29-73`** → `performInitialAuth()`, calls `config.refreshAuth(authType)`
5. **`packages/cli/src/gemini.tsx:186-326`** → `startInteractiveUI()`, renders React app with `initializationResult`
6. **`packages/cli/src/ui/AppContainer.tsx:670-695`** → `useAuthCommand()` hook, manages auth state machine
7. **`packages/cli/src/ui/AppContainer.tsx:717-719`** → derives `isAuthDialogOpen = authState === AuthState.Updating`
8. **`packages/cli/src/ui/components/DialogManager.tsx:305-318`** → renders `AuthDialog` when `isAuthDialogOpen`
9. **`packages/cli/src/ui/auth/AuthDialog.tsx:36-255`** → **THE AUTH SELECTION UI** — shows radio buttons: Login with Google / API Key / Vertex AI
10. **`packages/cli/src/ui/AppContainer.tsx:750-801`** → `handleAuthSelect()` calls `config.refreshAuth(authType)`
11. **`packages/core/src/config/config.ts:1209-1290`** → `refreshAuth()` calls `createContentGeneratorConfig()` then `createContentGenerator()`

### Auth State Machine

`AuthState` enum flow:
- `Updating` → dialog is open (user picks auth type)
- `Unauthenticated` → attempting auth
- `AwaitingApiKeyInput` → needs API key input
- `AwaitingGoogleLoginRestart` → browser OAuth flow
- `Authenticated` → success, proceed to chat

### Key Trigger

`shouldOpenAuthDialog = true` when `selectedType === undefined || !!authError` (initializer.ts:49-50). On first run, no auth type is saved → dialog opens.

---

## ContentGenerator Interface — The Key Abstraction

**`packages/core/src/core/contentGenerator.ts`** (lines 32-54):

```typescript
export interface ContentGenerator {
  generateContent(request: GenerateContentParameters, userPromptId: string, role: LlmRole): Promise<GenerateContentResponse>;
  generateContentStream(request: GenerateContentParameters, userPromptId: string, role: LlmRole): Promise<AsyncGenerator<GenerateContentResponse>>;
  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
  userTier?: UserTierId;
  userTierName?: string;
  paidTier?: GeminiUserTier;
}
```

All types from `@google/genai`. The adapter must accept these on input and return them on output.

### AuthType Enum (lines 56-63)

```typescript
export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  COMPUTE_ADC = 'compute-default-credentials',
  GATEWAY = 'gateway',
}
```

### Factory Function (lines 155-255)

`createContentGenerator()` branches on `config.authType`:
- `LOGIN_WITH_GOOGLE` / `COMPUTE_ADC` → `createCodeAssistContentGenerator()` (Google Cloud)
- `USE_GEMINI` / `USE_VERTEX_AI` / `GATEWAY` → `new GoogleGenAI({...}).models` → `LoggingContentGenerator`
- **New: `OPENAI_COMPATIBLE`** → `new OpenAIContentGenerator({...})` → `LoggingContentGenerator`

### Existing Implementations (patterns to follow)

| File | Purpose |
|------|---------|
| `packages/core/src/core/loggingContentGenerator.ts` | Decorator wrapping any ContentGenerator with telemetry |
| `packages/core/src/core/fakeContentGenerator.ts` | Returns canned responses from file (testing) |
| `packages/core/src/core/recordingContentGenerator.ts` | Records responses to file (fixture capture) |

---

## Build / Run / Test

```bash
npm install                        # Install dependencies
npm run build                      # Build all packages
npm start                          # Dev mode (auto-checks build)
npm test                           # All unit tests
npm test -w @google/gemini-cli-core -- src/core/contentGenerator.test.ts  # Single test
npm run test:e2e                   # End-to-end tests
npm run lint                       # ESLint
npm run typecheck                  # TypeScript check
npm run preflight                  # Full validation (slow — clean+build+lint+typecheck+test)
```

### Quick Rebuild & Run (after code changes)

```bash
npm run build && node packages/cli  # Build and run
# Or use the test script:
./scripts/test_openai_adapter.sh
```

---

## Coding Conventions

- **Strict TypeScript** — `strict: true`, `noImplicitAny`, `noUnusedLocals`, etc.
- **Module system** — ESM (`"module": "NodeNext"`), use `node:` protocol for built-ins (e.g., `import { promises } from 'node:fs'`)
- **Imports** — No relative imports between packages; use `@google/gemini-cli-core`
- **License headers** — Apache-2.0 on all new `.ts`/`.tsx`/`.js` files: `Copyright 2026 Google LLC`
- **Commit messages** — Conventional Commits (`feat:`, `fix:`, `refactor:`, etc.)
- **Testing** — Vitest; use `vi.stubEnv()` for env vars, not direct `process.env` mutation
- **No default exports** — Named exports only
- **No `any`** — Use proper types; `unknown` if needed
- **Legacy snippets** — Don't change verbiage in `packages/core/src/prompts/snippets.legacy.ts`
- **No restricted imports** — Don't use `os.homedir()` / `os.tmpdir()` directly; use gemini-cli-core helpers

---

## Files to Create

| File | Purpose |
|------|---------|
| `packages/core/src/core/openaiContentGenerator.ts` | ContentGenerator impl using OpenAI Chat Completions API |
| `packages/core/src/core/openaiTypeMapper.ts` | Gemini ↔ OpenAI type conversion functions |
| `packages/core/src/config/llmRegistry.ts` | TypeScript LLM registry mirroring a2g_models |
| `scripts/test_openai_adapter.sh` | Build + run script for testing during development |

## Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/core/contentGenerator.ts` | Add `OPENAI_COMPATIBLE` to AuthType, update factory |
| `packages/core/src/config/models.ts` | Allow pass-through of arbitrary model names |
| `packages/core/src/index.ts` | Export new modules |
| `packages/core/package.json` | Add `openai` dependency |
| `packages/cli/src/ui/auth/AuthDialog.tsx` | Replace auth picker with LLM model picker |
| `packages/core/src/core/initializer.ts` | Skip auth, detect OpenAI mode |

## Files NOT to Modify

- `packages/core/src/core/geminiChat.ts` — consumes ContentGenerator interface only
- `packages/core/src/core/client.ts` — consumes ContentGenerator interface only
- `packages/core/src/prompts/snippets.legacy.ts` — historical snapshot
- Ink UI rendering components (they consume `StreamEvent` → `GenerateContentResponse`)
