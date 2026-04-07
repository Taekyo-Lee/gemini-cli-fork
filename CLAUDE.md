# Gemini CLI Fork — Claude Code Project Context

## Fork Purpose

This is a fork of
[Google's Gemini CLI](https://github.com/google-gemini/gemini-cli) customized to
support **on-prem LLMs** (KIMI, DeepSeek, GLM, Qwen, etc.) and public
OpenAI-compatible APIs via `config/models.default.json`. Instead of prompting for
Google authentication on startup, the CLI should display a **model picker**
showing all available LLMs and connect via OpenAI-compatible endpoints.

**Key behavior change:** `$ gemini` → shows LLM selection list (not auth prompt)
→ connects to selected model via OpenAI Chat Completions API.

**Goal:** Make this fork as reliable and polished as Claude CLI for daily coding
use.

## Sister Project: claude-code-fork

After this project, we applied the same approach to Anthropic's Claude Code CLI — [claude-code-fork](https://github.com/Taekyo-Lee/claude-code-fork). Claude Code is not open source, but we forked it and made it work with any OpenAI-compatible endpoint using the same shim pattern. Many solutions from this project (streaming, tool call ID mapping, type conversion, model registry) were carried over. **When debugging a problem in this repo, claude-code-fork may also have relevant solutions** (especially `services/api/openai/shim.ts`, `typeMapper.ts`, `streamAdapter.ts`, and `registry.ts`).

## Workflow Rule

**After completing any Phase (or sub-phase), always update
`docs/fork/tracking/todo.md`** — mark completed items with `[x]`, add notes on
what was done, and ensure the status accurately reflects reality. This keeps
`docs/fork/tracking/todo.md` as the single source of truth for project progress.

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

## Model Configuration

Models are defined in `config/models.default.json` — edit that file to
add/remove models, no code changes needed. On startup, `llmRegistry.ts` loads it
and falls back to a minimal hardcoded gpt-4o if the file is missing.

See `docs/fork/architecture/dynamic-model-loading.md` for the field reference.

A lightweight Python helper (`scripts/fork/gemini_llm.py`) lets coworkers use
models from this registry with `langchain_openai.ChatOpenAI` — just
`pip install langchain-openai`, no other dependencies needed.

### Env File

`.env` at the repo root (gitignored). Template: `.env.example` (tracked).
`scripts/fork/setup.sh` auto-copies the template and sources `.env` from
`~/.bashrc` so env vars are available globally.

API keys only — base URLs come from each model's `url` in `config/models.default.json`:

- `OPENAI_API_KEY` (if using OpenAI models)
- `ANTHROPIC_API_KEY` (if using Anthropic models)
- `OPENROUTER_API_KEY` (if using OpenRouter models)
- `AD_ID`, `FALLBACK_API_KEY_1` (corp on-prem auth)
- `A2G_LOCATION` (environment detection: `CORP`, `DEV`, or `HOME`)
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` (on-prem
  Langfuse telemetry — auto-enables OTLP export when keys are present)

---

## Known Issues

All critical, medium, and minor issues from Phase 7 have been resolved. See
`docs/fork/tracking/todo.md` for the full history of fixes. Key fixes applied:

- Per-instance `ToolCallIdTracker` (was global mutable state)
- Streaming tool call emission at end-of-stream (was silently dropped)
- `OPENAI_COMPATIBLE` in `validateAuthMethod()` (was rejected)
- Corp model headers as lazy getter, `max_tokens` pass-through, `extraBody`
  ordering, `countTokens` text extraction, `custom` field removal

---

## Python LLM Helper

```python
# pip install langchain-openai
import sys; sys.path.insert(0, "scripts/fork")
from gemini_llm import from_model, list_models

list_models()                          # Show models for your environment
llm = from_model("GLM-5-Thinking")     # Get a configured ChatOpenAI
llm.invoke("Hello")                    # Use it
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
./scripts/fork/test_openai_adapter.sh
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

All fork-specific docs live in `docs/fork/` (separate from upstream `docs/`):

| Directory                 | Contents                                     |
| ------------------------- | -------------------------------------------- |
| `docs/fork/overview/`     | Fork philosophy, fork-vs-upstream comparison |
| `docs/fork/setup/`        | Install guide, troubleshooting               |
| `docs/fork/architecture/` | OpenAI-compatible mode, model registry       |
| `docs/fork/tracing/`      | Telemetry setup, Langfuse integration, trace comparison |
| `docs/fork/upstream/`     | Upstream merge plan, conflict resolution     |
| `docs/fork/tracking/`     | TODO, changelog, phase plans                 |

## Files Created by Fork

| File                                               | Purpose                                          |
| -------------------------------------------------- | ------------------------------------------------ |
| `config/models.default.json`                       | User model config (gitignored, from template)    |
| `config/models.default.json.example`               | Model config template (tracked)                  |
| `.env`                                             | User env vars (gitignored, from template)        |
| `.env.example`                                     | Env var template (tracked)                       |
| `NOTICE`                                           | Apache 2.0 derivative work attribution           |
| `packages/core/src/config/llmRegistry.ts`          | JSON loader, env detection, public API           |
| `packages/core/src/core/openaiTypeMapper.ts`       | Gemini <> OpenAI type conversion                 |
| `packages/core/src/core/openaiContentGenerator.ts` | ContentGenerator impl using OpenAI SDK           |
| `packages/core/src/core/openaiFactory.ts`          | OpenAI factory (extracted from contentGenerator) |
| `packages/cli/src/core/openaiInitializer.ts`       | OpenAI auto-connect (extracted from initializer) |
| `packages/cli/src/ui/auth/OpenAIModelPicker.tsx`   | Model picker UI (extracted from AuthDialog)      |
| `scripts/fork/setup.sh`                      | One-shot setup: build, link, env, bashrc         |
| `scripts/fork/test_openai_adapter.sh`              | Build/test/run script                            |
| `scripts/fork/gemini_llm.py`                       | Python LLM helper (langchain-openai)             |
| `scripts/fork/test_glm5_tools.py`                  | GLM-5 multi-turn tool call test                  |
| `scripts/fork/upstream-sync.sh`                    | Upstream sync workflow                           |
| `scripts/fork/verify-fork-features.sh`             | Post-merge feature verification                  |
| `scripts/fork/fork-diff-report.sh`                 | Pre-merge conflict analysis                      |

## Files Modified by Fork (Phase 10: Telemetry Parity)

| File                                                  | Change                                               |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `packages/core/src/core/loggingContentGenerator.ts`   | Utility spans skip `langfuse.trace.*` (no overwrite) |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`        | Removed `user_prompt` wrapper span for trace parity  |

## Files Modified by Fork (Phase 9: Sandbox)

| File                                        | Change                                           |
| ------------------------------------------- | ------------------------------------------------ |
| `packages/cli/src/config/sandboxConfig.ts`  | `bestEffort` parameter for graceful fallback     |
| `packages/cli/src/config/config.ts`         | YOLO auto-enables sandbox, bypasses folder trust |
| `packages/cli/src/gemini.tsx`               | YOLO auto-enable for process-level sandbox       |
| `packages/cli/src/ui/components/Footer.tsx` | Sandbox indicator from config, not just env var  |
| `packages/cli/src/utils/sandbox.ts`         | Env file mount, fork repo volume mount           |
| `packages/cli/src/utils/sandboxUtils.ts`    | Env file sourcing, local clone detection         |

## Lessons Learned

- **Check existing infrastructure before building.** Both Gemini CLI and Claude Code have extensive built-in mechanisms (streaming states, rendering pipelines, pending item patterns). Before implementing a feature manually, trace how the analogous existing feature works end-to-end (e.g., how text streams via `handleContentEvent` → `setPendingHistoryItem` → renders outside `<Static>` → live updates). The infrastructure you need likely already exists — you just need to wire it up. Example: reasoning token streaming was initially built with manual accumulation and `addItem()` to static history, but the existing `pendingHistoryItem` pattern already solves real-time streaming — it just needed a `pendingThought` state using the same pattern.

## Files NOT to Modify

- `packages/core/src/prompts/snippets.legacy.ts` — historical snapshot
- Ink UI rendering components (they consume `StreamEvent` →
  `GenerateContentResponse`)

## Upstream Sync

See `docs/fork/upstream/upstream-sync-guide.md` for the full merge strategy,
conflict resolution guide, and step-by-step process. See
`docs/fork/upstream/merge-history.md` for the log of past merges.

### Sync scripts

| Script                                 | Purpose                                     |
| -------------------------------------- | ------------------------------------------- |
| `scripts/fork/upstream-sync.sh`        | Main sync workflow (fetch, backup, analyze) |
| `scripts/fork/verify-fork-features.sh` | Post-merge verification checklist           |
| `scripts/fork/fork-diff-report.sh`     | Pre-merge conflict analysis                 |

### Key rules

- **Never cherry-pick** — always merge
- **All fork changes marked** with `// [FORK]` comments in upstream files
- **Fork code extracted** into separate files to minimize conflict surface
- Run `./scripts/fork/verify-fork-features.sh` after every merge
