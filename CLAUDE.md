# Gemini CLI Fork — Claude Code Project Context

## Fork Purpose

This is a fork of
[Google's Gemini CLI](https://github.com/google-gemini/gemini-cli)
customized to support **on-prem LLMs** (KIMI, DeepSeek, GLM, Qwen, etc.) and
public OpenAI-compatible APIs via the **a2g_models** registry. Instead of
prompting for Google authentication on startup, the CLI should display a **model
picker** showing all available LLMs and connect via OpenAI-compatible endpoints.

**Key behavior change:** `$ gemini` → shows LLM selection list (not auth prompt)
→ connects to selected model via OpenAI Chat Completions API.

**Goal:** Make this fork as reliable and polished as Claude CLI for daily coding
use.

## Workflow Rule

**After completing any Phase (or sub-phase), always update `docs-fork/tracking/todo.md`** — mark
completed items with `[x]`, add notes on what was done, and ensure the status
accurately reflects reality. This keeps `docs-fork/tracking/todo.md` as the single source of truth
for project progress.

## Architecture

Monorepo using npm workspaces:

| Package                         | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `packages/cli`                  | Terminal UI (React + Ink), argument parsing (yargs), entry point        |
| `packages/core`                 | Backend: LLM orchestration, prompt construction, tool execution, config |
| `packages/a2a-server`           | Experimental Agent-to-Agent server                                      |
| `packages/sdk`                  | SDK package                                                             |
| `packages/vscode-ide-companion` | VS Code extension                                                       |
| `packages/devtools`             | Developer tooling                                                       |
| `packages/test-utils`           | Shared test utilities                                                   |

**Runtime:** Node.js >= 20 | **Language:** TypeScript (strict) | **UI:** React +
Ink | **Testing:** Vitest | **Bundling:** esbuild

---

## The a2g_models LLM Registry (Source of Truth)

The Python `a2g_models` package at
`~/workspace/main/research/a2g_packages/src/a2g_models/` defines all available
LLMs. Our TypeScript registry must mirror this data.

### Key Python files

- `registries/llm_registries.py` → LLMRegistry class |
  `configurations/llm_configurations.py` → LLMConfig model
- `utils/utils.py` → `detect_location()`: checks `PROJECT_A2G_LOCATION` env var
  (CORP/DEV/HOME), hostname patterns, defaults to HOME
- LLMConfig fields: `model`, `model_alias`, `url`, `api_key_env`,
  `context_length`, `max_tokens`, `corp/home/dev` (bools), `reasoning_model`,
  `extra_body`, `default_headers`

### Complete Model Registry

See `packages/core/src/config/llmRegistry.ts` for the full model registry (27
models). Summary: 8 CORP (on-prem), 6 DEV/HOME (OpenRouter), 12 OpenAI (direct),
1 Anthropic. For the original Python source, see
`docs-fork/model-registry-reference.md`.

### Env File Location

`~/workspace/main/research/a2g_packages/envs/.env` — contains API keys:

- `PROJECT_OPENAI_API_KEY`, `PROJECT_OPENAI_API_BASE`
- `PROJECT_ANTHROPIC_API_KEY`, `PROJECT_ANTHROPIC_API_BASE`
- `PROJECT_OPENROUTER_API_KEY`, `PROJECT_OPENROUTER_API_BASE`
- `PROJECT_LITE_LLM_KEY`, `PROJECT_LITE_URL`
- `PROJECT_AD_ID`, `PROJECT_FALLBACK_API_KEY_1/2` (corp auth)
- `PROJECT_A2G_LOCATION` (environment detection)

---

## Known Issues

All critical, medium, and minor issues from Phase 7 have been resolved. See
`docs-fork/tracking/todo.md` for the full history of fixes. Key fixes applied:

- Per-instance `ToolCallIdTracker` (was global mutable state)
- Streaming tool call emission at end-of-stream (was silently dropped)
- `OPENAI_COMPATIBLE` in `validateAuthMethod()` (was rejected)
- Corp model headers as lazy getter, `max_tokens` pass-through, `extraBody`
  ordering, `countTokens` text extraction, `custom` field removal

---

## Reference Python Scripts

```bash
ENV="--env-file ~/workspace/main/research/a2g_packages/envs/.env"
uv run --native-tls --active $ENV on_prem_llms_test/list_available_llms.py  # List models (model picker reference)
uv run --native-tls --active $ENV on_prem_llms_test/llm_test.py            # Test model end-to-end
```

---

## Startup / Auth Flow

**OpenAI mode:** `index.ts` → `main()` → `initializeApp()` detects OpenAI env
vars → skips `performInitialAuth()` → forces `shouldOpenAuthDialog=true` →
`AuthDialog` renders `OpenAIModelPicker` → user selects model →
`config.refreshAuth(OPENAI_COMPATIBLE)` → `createContentGenerator()` →
`OpenAIContentGenerator`.

**Google mode (original):** Same flow but `AuthDialog` renders
`GoogleAuthDialog` with Login/API Key/Vertex AI options.

AuthState: `Updating` (dialog open) → `Authenticated` (success). Key files:
`initializer.ts`, `useAuth.ts`, `AuthDialog.tsx`, `config.ts:refreshAuth()`.

---

## ContentGenerator Interface

**`packages/core/src/core/contentGenerator.ts`** — The key abstraction. All
types from `@google/genai`. Methods: `generateContent()`,
`generateContentStream()`, `countTokens()`, `embedContent()`.

**AuthType enum:** `LOGIN_WITH_GOOGLE`, `USE_GEMINI`, `USE_VERTEX_AI`,
`LEGACY_CLOUD_SHELL`, `COMPUTE_ADC`, `GATEWAY`, **`OPENAI_COMPATIBLE`** (new).

**`createContentGenerator()` factory** branches on `config.authType`:

- Google auth types → `GoogleGenAI` or `createCodeAssistContentGenerator()`
- `OPENAI_COMPATIBLE` → `OpenAIContentGenerator` → `LoggingContentGenerator`

Implementations: `loggingContentGenerator.ts` (telemetry decorator),
`fakeContentGenerator.ts` (testing), `recordingContentGenerator.ts` (fixture
capture).

---

## Build / Run / Test

```bash
npm install --ignore-scripts       # Install dependencies
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

- **Strict TypeScript** — `strict: true`, `noImplicitAny`, `noUnusedLocals`,
  etc.
- **Module system** — ESM (`"module": "NodeNext"`), use `node:` protocol for
  built-ins (e.g., `import { promises } from 'node:fs'`)
- **Imports** — No relative imports between packages; use
  `@google/gemini-cli-core`
- **License headers** — Apache-2.0 on all new `.ts`/`.tsx`/`.js` files:
  `Copyright 2026 Google LLC`
- **Commit messages** — Conventional Commits (`feat:`, `fix:`, `refactor:`,
  etc.)
- **Testing** — Vitest; use `vi.stubEnv()` for env vars, not direct
  `process.env` mutation
- **No default exports** — Named exports only
- **No `any`** — Use proper types; `unknown` if needed
- **Legacy snippets** — Don't change verbiage in
  `packages/core/src/prompts/snippets.legacy.ts`
- **No restricted imports** — Don't use `os.homedir()` / `os.tmpdir()` directly;
  use gemini-cli-core helpers

---

## Fork Documentation

All fork-specific docs live in `docs-fork/` (separate from upstream `docs/`):

| Directory | Contents |
| --------- | -------- |
| `docs-fork/overview/`      | Fork philosophy, fork-vs-upstream comparison |
| `docs-fork/setup/`         | Install guide, troubleshooting               |
| `docs-fork/architecture/`  | OpenAI-compatible mode, model registry       |
| `docs-fork/upstream/`      | Upstream merge plan, conflict resolution     |
| `docs-fork/tracking/`      | TODO, changelog                              |

## Files Created by Fork

| File                                               | Purpose                                             |
| -------------------------------------------------- | --------------------------------------------------- |
| `packages/core/src/config/llmRegistry.ts`          | TypeScript LLM registry (mirrors a2g_models)         |
| `packages/core/src/core/openaiTypeMapper.ts`       | Gemini <> OpenAI type conversion                    |
| `packages/core/src/core/openaiContentGenerator.ts` | ContentGenerator impl using OpenAI SDK              |
| `packages/core/src/core/openaiFactory.ts`          | OpenAI factory (extracted from contentGenerator)    |
| `packages/cli/src/core/openaiInitializer.ts`       | OpenAI auto-connect (extracted from initializer)    |
| `packages/cli/src/ui/auth/OpenAIModelPicker.tsx`   | Model picker UI (extracted from AuthDialog)         |
| `scripts/test_openai_adapter.sh`                   | Build/test/run script                               |
| `scripts/test_glm5_tools.py`                       | GLM-5 multi-turn tool call test                     |
| `scripts/upstream-sync.sh`                         | Upstream sync workflow                              |
| `scripts/verify-fork-features.sh`                  | Post-merge feature verification                     |
| `scripts/fork-diff-report.sh`                      | Pre-merge conflict analysis                         |

## Files Modified by Fork (Phase 9: Sandbox)

| File                                        | Change                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `packages/cli/src/config/sandboxConfig.ts`  | `bestEffort` parameter for graceful fallback     |
| `packages/cli/src/config/config.ts`         | YOLO auto-enables sandbox, bypasses folder trust |
| `packages/cli/src/gemini.tsx`               | YOLO auto-enable for process-level sandbox       |
| `packages/cli/src/ui/components/Footer.tsx` | Sandbox indicator from config, not just env var  |
| `packages/cli/src/utils/sandbox.ts`         | Env file mount, fork repo volume mount           |
| `packages/cli/src/utils/sandboxUtils.ts`    | Env file sourcing, local clone detection         |

## Files NOT to Modify

- `packages/core/src/prompts/snippets.legacy.ts` — historical snapshot
- Ink UI rendering components (they consume `StreamEvent` →
  `GenerateContentResponse`)

## Upstream Sync

See `docs-fork/upstream/upstream-merge-plan.md` for the full merge strategy and
conflict resolution guide.

### Sync scripts

| Script                           | Purpose                                    |
| -------------------------------- | ------------------------------------------ |
| `scripts/upstream-sync.sh`       | Main sync workflow (fetch, backup, analyze) |
| `scripts/verify-fork-features.sh` | Post-merge verification checklist          |
| `scripts/fork-diff-report.sh`   | Pre-merge conflict analysis                |

### Key rules

- **Never cherry-pick** — always merge
- **All fork changes marked** with `// [FORK]` comments in upstream files
- **Fork code extracted** into separate files to minimize conflict surface
- Run `./scripts/verify-fork-features.sh` after every merge
