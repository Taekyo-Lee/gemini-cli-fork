# TODO: Replace Auth with LLM Picker + OpenAI-Compatible API

## Overview

Replace the Gemini auth prompt with an LLM selection list. When user runs `$ gemini`, show available models from the a2g_models registry, let them pick one, and connect via OpenAI Chat Completions API.

---

## Phase 0: Project Setup & Test Script

- [ ] **Create `scripts/test_openai_adapter.sh`** — build+run script for iterative testing
  - Loads env vars from `~/workspace/main/research/a2g_packages/envs/.env`
  - Builds the project
  - Runs `gemini` with OpenAI-compatible mode
  - See script below for details

- [ ] **Add `openai` dependency to `packages/core/package.json`**
  - Add `"openai": "^4.x"` to dependencies
  - Run `npm install` from repo root

- [ ] **Add `dotenv` dependency to `packages/core/package.json`** (if needed for .env loading)

---

## Phase 1: TypeScript LLM Registry

### 1.1 Create the Registry

- [ ] **Create `packages/core/src/config/llmRegistry.ts`**

  Mirror the Python `a2g_models` LLMRegistry. Define:

  ```typescript
  export interface LLMModelConfig {
    model: string;                          // Display name (e.g., 'dev-DeepSeek-V3.2')
    modelAlias?: string;                    // Actual model sent to API (e.g., 'deepseek/deepseek-v3.2')
    url: string;                            // OpenAI-compatible base URL
    modality?: { input: string[]; output: string[] };
    apiKeyEnv?: string;                     // Env var name for API key
    contextLength: number;
    maxTokens: number;
    corp: boolean;                          // Available in CORPORATE environment
    home: boolean;                          // Available in HOME environment
    dev: boolean;                           // Available in DEV environment
    supportsResponsesApi: boolean;
    reasoningModel: boolean;
    extraBody?: Record<string, unknown>;    // Provider-specific params
    defaultHeaders?: Record<string, string>;
  }

  export type EnvironmentType = 'CORP' | 'DEV' | 'HOME';

  export function detectLocation(): EnvironmentType { ... }
  export function getAvailableModels(): LLMModelConfig[] { ... }
  export function getModelByName(name: string): LLMModelConfig | undefined { ... }
  ```

  **Environment detection logic** (mirror Python's `detect_location()`):
  1. `PROJECT_A2G_LOCATION` env var → "COMPANY"/"PRODUCTION"/"CORP" → `CORP`, "DEVELOPMENT"/"DEV" → `DEV`, "HOME" → `HOME`
  2. Hostname patterns ('prod', 'company', 'server') → `CORP`
  3. Default → `HOME`

  **Registry data:** Hardcode all models from `llm_registries.py` and `default_llm_registries.py`. Key models:

  CORP models (url: `http://a2g.samsungds.net:7620/v1`):
  - GLM-5-Thinking, GLM-5-Non-Thinking, Kimi-K2.5-Thinking, Kimi-K2.5-Non-Thinking
  - Qwen3.5-35B-A3B, Qwen3.5-122B-A10B, gpt-oss-120b
  - GaussO-Owl-Ultra-Instruct (different URL + custom headers)

  HOME/DEV models (url: `https://openrouter.ai/api/v1`, apiKeyEnv: `PROJECT_OPENROUTER_API_KEY`):
  - dev-DeepSeek-V3.2 (alias: deepseek/deepseek-v3.2)
  - dev-claude-haiku-4.5 (alias: anthropic/claude-haiku-4.5)
  - dev-Gemini-3.1-Pro-Preview (alias: google/gemini-3.1-pro-preview)
  - dev-Claude-Opus-4.6 (alias: anthropic/claude-opus-4.6)

  Default OpenAI models (url: `https://api.openai.com/v1`):
  - gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
  - o1, o3-mini, o4-mini, gpt-5, gpt-5-nano, gpt-5-mini, gpt-5.2

### 1.2 Export the Registry

- [ ] **Edit `packages/core/src/index.ts`**
  - Add `export * from './config/llmRegistry.js';`

---

## Phase 2: OpenAI ContentGenerator

### 2.1 Type Mapper

- [ ] **Create `packages/core/src/core/openaiTypeMapper.ts`**

  Functions to convert between Gemini and OpenAI formats:

  ```typescript
  // Gemini → OpenAI (for requests)
  geminiContentsToOpenAIMessages(contents: Content[], systemInstruction?: Content): ChatCompletionMessageParam[]
  geminiToolsToOpenAITools(tools: Tool[]): ChatCompletionTool[]

  // OpenAI → Gemini (for responses)
  openaiResponseToGeminiResponse(response: ChatCompletion): GenerateContentResponse
  openaiStreamChunkToGeminiResponse(chunk: ChatCompletionChunk): GenerateContentResponse
  ```

  **Critical type mappings:**

  | Gemini | OpenAI |
  |--------|--------|
  | `Content { role: "user", parts: [{ text }] }` | `{ role: "user", content: "text" }` |
  | `Content { role: "model", parts: [{ text }] }` | `{ role: "assistant", content: "text" }` |
  | `Part.functionCall { name, args }` | `tool_calls: [{ type: "function", function: { name, arguments: JSON.stringify(args) } }]` |
  | `Part.functionResponse { name, response }` | `{ role: "tool", tool_call_id, content: JSON.stringify(response) }` |
  | `systemInstruction` (in GenerateContentParameters.config) | `{ role: "system", content: "..." }` |
  | `Tool.functionDeclarations[]` | `tools: [{ type: "function", function: { name, description, parameters } }]` |
  | OpenAI `choices[0].message.content` | `candidates[0].content.parts[0].text` |
  | OpenAI `choices[0].message.tool_calls` | `candidates[0].content.parts[].functionCall` |

  **Tool call ID tracking:** OpenAI requires `tool_call_id` to match tool responses with calls. Gemini doesn't have this. Generate deterministic IDs (e.g., `call_{name}_{index}`) and track them.

### 2.2 Content Generator

- [ ] **Create `packages/core/src/core/openaiContentGenerator.ts`**

  Implement `ContentGenerator` interface:

  ```typescript
  import OpenAI from 'openai';

  export class OpenAIContentGenerator implements ContentGenerator {
    private client: OpenAI;
    private modelName: string;
    private extraBody?: Record<string, unknown>;
    userTier?: UserTierId;
    userTierName?: string;
    paidTier?: GeminiUserTier;

    constructor(config: { baseURL: string; apiKey: string; model: string; extraBody?: Record<string, unknown>; defaultHeaders?: Record<string, string> }) {
      this.client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, defaultHeaders: config.defaultHeaders });
      this.modelName = config.model;
      this.extraBody = config.extraBody;
    }

    async generateContent(request, userPromptId, role): Promise<GenerateContentResponse> { ... }
    async generateContentStream(request, userPromptId, role): Promise<AsyncGenerator<GenerateContentResponse>> { ... }
    async countTokens(request): Promise<CountTokensResponse> { /* heuristic: chars/4 */ }
    async embedContent(request): Promise<EmbedContentResponse> { throw new Error('Not supported'); }
  }
  ```

  **generateContent():**
  1. Convert `request.contents` → OpenAI messages using type mapper
  2. Convert `request.config.tools` → OpenAI tools
  3. Call `this.client.chat.completions.create({ model, messages, tools, stream: false })`
  4. Convert response back to `GenerateContentResponse`

  **generateContentStream():**
  1. Same conversion as above
  2. Call `this.client.chat.completions.create({ ..., stream: true })`
  3. Return async generator that yields `GenerateContentResponse` for each SSE chunk
  4. Each chunk needs: `{ candidates: [{ content: { parts: [{ text }], role: "model" }, index: 0 }] }`
  5. Handle `usageMetadata` from the final chunk (if provider sends it)

  **countTokens():**
  - Heuristic: `Math.ceil(JSON.stringify(request.contents).length / 4)`
  - Return `{ totalTokens: estimate }`

### 2.3 Export

- [ ] **Edit `packages/core/src/index.ts`**
  - Add `export * from './core/openaiContentGenerator.js';`
  - Add `export * from './core/openaiTypeMapper.js';`

---

## Phase 3: Wire Into Auth & Config

### 3.1 Add New Auth Type

- [ ] **Edit `packages/core/src/core/contentGenerator.ts`**

  **Line 62:** Add to AuthType enum:
  ```typescript
  OPENAI_COMPATIBLE = 'openai-compatible',
  ```

  **Lines 73-90:** Update `getAuthTypeFromEnv()`:
  ```typescript
  // Add BEFORE the existing checks (highest priority for this fork)
  if (process.env['OPENAI_BASE_URL'] || process.env['PROJECT_OPENROUTER_API_KEY']) {
    return AuthType.OPENAI_COMPATIBLE;
  }
  ```

  **Lines 101-153:** Update `createContentGeneratorConfig()`:
  ```typescript
  if (authType === AuthType.OPENAI_COMPATIBLE) {
    // Config is handled differently — model selection happens in UI
    return { authType, ...otherFields };
  }
  ```

  **Lines 155-255:** Update `createContentGenerator()` factory — add branch:
  ```typescript
  if (config.authType === AuthType.OPENAI_COMPATIBLE) {
    const modelConfig = getModelByName(selectedModelName);
    const apiKey = process.env[modelConfig.apiKeyEnv ?? 'OPENAI_API_KEY'] ?? '';
    const generator = new OpenAIContentGenerator({
      baseURL: modelConfig.url,
      apiKey,
      model: modelConfig.modelAlias ?? modelConfig.model,
      extraBody: modelConfig.extraBody,
      defaultHeaders: modelConfig.defaultHeaders,
    });
    return new LoggingContentGenerator(generator, gcConfig);
  }
  ```

### 3.2 Model Pass-Through

- [ ] **Edit `packages/core/src/config/models.ts`**
  - In `resolveModel()` (line 49): if model name is not in `VALID_GEMINI_MODELS`, return it as-is (pass-through for OpenAI models)
  - Or: add a check for `AuthType.OPENAI_COMPATIBLE` to skip validation entirely

### 3.3 Config Updates

- [ ] **Edit `packages/core/src/config/config.ts`**
  - Add field for selected OpenAI model name (so `refreshAuth` can use it)
  - Add method `setSelectedOpenAIModel(modelName: string)`
  - In `refreshAuth()`: pass selected model to `createContentGenerator()`

---

## Phase 4: Replace Auth Dialog with LLM Picker

### 4.1 Modify AuthDialog

- [ ] **Edit `packages/cli/src/ui/auth/AuthDialog.tsx`**

  The model list should match the output of `on_prem_llms_test/list_available_llms.py`.
  After selecting a model, verify with `on_prem_llms_test/llm_test.py` pattern (send "hello", check response).

  Replace the auth type radio buttons (lines 45-78) with LLM model options:

  ```typescript
  import { getAvailableModels } from '@google/gemini-cli-core';

  const models = getAvailableModels();
  const items = models.map(m => ({
    label: `${m.model} ${m.modelAlias ? `(${m.modelAlias})` : ''} — ${m.url}`,
    value: m.model,
    key: m.model,
  }));
  ```

  Change the prompt text (line 221):
  ```
  "How would you like to authenticate for this project?"
  → "Select a model:"
  ```

  Change `onSelect` callback (lines 116-152):
  - Instead of setting auth type and calling `setAuthState(AuthState.Unauthenticated)`:
  - Save selected model name to config
  - Set auth type to `AuthType.OPENAI_COMPATIBLE`
  - Call `config.refreshAuth(AuthType.OPENAI_COMPATIBLE)` with model details
  - Set `authState = AuthState.Authenticated`

### 4.2 Load Env Vars

- [ ] **Edit startup flow** (either `packages/cli/src/gemini.tsx` or `initializer.ts`)
  - Load env vars from `~/workspace/main/research/a2g_packages/envs/.env` at startup
  - Use `dotenv` package or manual `fs.readFileSync` + parse
  - This ensures API keys are available for the selected model

### 4.3 Skip Google Auth

- [ ] **Edit `packages/core/src/core/initializer.ts`**
  - When OpenAI mode is detected, skip `performInitialAuth()` entirely
  - Set `shouldOpenAuthDialog = true` to show LLM picker instead
  - Or: force `authType = OPENAI_COMPATIBLE` and proceed to model selection

---

## Phase 5: Testing (Run After Each Phase)

### 5.1 Test Script

- [ ] **Use `./scripts/test_openai_adapter.sh`** after each phase to verify:
  - `npm run build` passes
  - `npm run typecheck` passes
  - `gemini` launches and shows the LLM picker (after Phase 4)
  - Selecting a model connects and gets a response (after Phase 4)

### 5.2 Unit Tests

- [ ] **Create `packages/core/src/core/openaiTypeMapper.test.ts`**
  - Test Gemini → OpenAI message conversion
  - Test OpenAI → Gemini response conversion
  - Test tool/function call round-trip
  - Test system instruction mapping
  - Test multi-turn conversation with tool calls

- [ ] **Create `packages/core/src/core/openaiContentGenerator.test.ts`**
  - Mock OpenAI client, test generateContent()
  - Mock streaming, test generateContentStream() async generator
  - Test countTokens() heuristic
  - Test error handling

- [ ] **Create `packages/core/src/config/llmRegistry.test.ts`**
  - Test environment detection with `vi.stubEnv()`
  - Test model filtering by environment
  - Test getModelByName()

### 5.3 Integration Smoke Test

- [ ] **Create `on_prem_llms_test/test_gemini_cli_adapter.ts`**
  - Import `OpenAIContentGenerator` from built package
  - Set env vars, instantiate generator
  - Send prompt, verify response format matches `GenerateContentResponse`
  - Test streaming

### 5.4 Verify Upstream Tests

- [ ] `npm test` — all existing tests still pass
- [ ] `npm run typecheck` — no type errors
- [ ] `npm run lint` — no lint violations

---

## Phase 6: Polish & Documentation

- [ ] Remember last selected model (save to `~/.gemini/settings.json`)
- [ ] Show model details in selection list (context length, reasoning capability)
- [ ] Handle connection errors gracefully (model unavailable, invalid API key)
- [ ] Update `INSTALL_GUIDE.md` with OpenAI-compatible setup
- [ ] Create `docs/openai-compatible.md` with full documentation

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
1. `request.config.tools[].functionDeclarations[]` → `tools: [{ type: "function", function: { name, description, parameters } }]`
2. History with `functionCall` parts → assistant message with `tool_calls`
3. History with `functionResponse` parts → tool role message with `tool_call_id`

**OpenAI → Gemini (response):**
1. `choices[0].message.tool_calls` → `candidates[0].content.parts[].functionCall { name, args: JSON.parse(arguments) }`

### What NOT to Change

- `geminiChat.ts`, `client.ts` — they consume ContentGenerator interface only
- Ink UI rendering — consumes StreamEvent wrapping GenerateContentResponse
- Existing auth types — new type is additive
- `packages/core/src/prompts/snippets.legacy.ts` — historical snapshot

### Implementation Order

1. Phase 0 (test script) → lets us verify builds continuously
2. Phase 1 (registry) → pure data, no side effects
3. Phase 2 (OpenAI generator) → core functionality
4. Phase 3 (wiring) → connect to existing system
5. Phase 4 (UI) → user-facing change
6. Phase 5 (testing) → run throughout, but formal tests last
