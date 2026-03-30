# Fork vs Upstream Comparison

Side-by-side comparison of this fork against
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli).

---

## High-Level Comparison

| Aspect                 | Upstream (google-gemini/gemini-cli) | This Fork                                                                                |
| ---------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| **Purpose**            | Google Gemini AI assistant CLI      | Multi-LLM CLI (on-prem + cloud)                                                          |
| **Auth**               | Google OAuth / API Key / Vertex AI  | OpenAI-compatible model picker                                                           |
| **Models**             | Gemini family only                  | Multiple providers: CORP on-prem (KIMI, GLM, Qwen), OpenRouter, OpenAI, Anthropic        |
| **Startup**            | Google auth prompt                  | LLM selection list → OpenAI Chat Completions API                                         |
| **Key addition**       | —                                   | `llmRegistry.ts`, `openaiContentGenerator.ts`, `openaiTypeMapper.ts`, `openaiFactory.ts` |
| **API layer**          | `@google/genai` SDK                 | OpenAI SDK (via ContentGenerator interface)                                              |
| **Sandbox**            | Docker/Podman required              | bestEffort fallback + YOLO auto-enable                                                   |
| **Input**              | Standard                            | Korean IME fix (getLatestText)                                                           |
| **Multi-turn**         | Gemini-optimized                    | Universal fixes (nextSpeakerCheck, MAX_TOKENS, null-default-continue)                    |
| **Env detection**      | —                                   | `A2G_LOCATION` (CORP/DEV/HOME)                                                           |
| **Tool compatibility** | Gemini-native                       | OpenAI tool name sanitization + schema forwarding                                        |

---

## Architecture: Where Fork Code Plugs In

```
┌─────────────────────────────────────────────────────────────────┐
│                        packages/cli                              │
│                                                                  │
│  gemini.tsx ──→ initializer.ts ──→ openaiInitializer.ts [FORK]  │
│       │              │                                           │
│       │              ▼                                           │
│       │         AuthDialog.tsx ──→ OpenAIModelPicker.tsx [FORK]  │
│       │              │                                           │
│       │         useAuth.ts [FORK: skip Google auth]              │
│       │                                                          │
│  config.ts [FORK: YOLO sandbox, skipNextSpeakerCheck]           │
│  sandboxConfig.ts [FORK: bestEffort]                            │
│  sandbox.ts [FORK: env file mount, repo volume]                 │
│  sandboxUtils.ts [FORK: env sourcing, local clone]              │
│  auth.ts [FORK: OPENAI_COMPATIBLE validation]                   │
│  Footer.tsx [FORK: configuredSandbox]                           │
│  InputPrompt.tsx [FORK: getLatestText for IME]                  │
│  text-buffer.ts [FORK: getLatestText + latestLinesRef]          │
│  KeypressContext.tsx [FORK: IME stdin reorder]                   │
│  useGeminiStream.ts [FORK: InvalidStream message]               │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                       packages/core                              │
│                                                                  │
│  contentGenerator.ts ──→ openaiFactory.ts [FORK]                │
│       │                       │                                  │
│       │                       ▼                                  │
│       │              openaiContentGenerator.ts [FORK]            │
│       │                       │                                  │
│       │                       ▼                                  │
│       │              openaiTypeMapper.ts [FORK]                  │
│       │                                                          │
│  llmRegistry.ts [FORK] ← models.default.json                   │
│                                                                  │
│  client.ts [FORK: MAX_TOKENS, null-default-continue]            │
│  geminiChat.ts [FORK: universal retry/recovery]                 │
│                                                                  │
│  index.ts [FORK: 4 export lines]                                │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** The fork plugs in through the `ContentGenerator` interface.
`geminiChat.ts` and `client.ts` consume this interface — they don't know or care
whether the backend is Google's `@google/genai` SDK or our
`OpenAIContentGenerator`.

---

## File-by-File Modification Inventory

### Fork-created files (conflict risk: NONE)

| File                                                    | Lines | Purpose                                           |
| ------------------------------------------------------- | ----- | ------------------------------------------------- |
| `packages/core/src/config/llmRegistry.ts`               | ~400  | Multi-model registry with env detection           |
| `packages/core/src/core/openaiContentGenerator.ts`      | ~350  | OpenAI SDK ↔ ContentGenerator adapter            |
| `packages/core/src/core/openaiTypeMapper.ts`            | ~300  | Gemini ↔ OpenAI type mapping                     |
| `packages/core/src/core/openaiFactory.ts`               | ~80   | Factory functions extracted from contentGenerator |
| `packages/cli/src/core/openaiInitializer.ts`            | ~30   | Auto-connect logic extracted from initializer     |
| `packages/cli/src/ui/auth/OpenAIModelPicker.tsx`        | ~140  | Model picker UI extracted from AuthDialog         |
| `packages/core/src/config/llmRegistry.test.ts`          | ~150  | 15 registry tests                                 |
| `packages/core/src/core/openaiTypeMapper.test.ts`       | ~400  | 27 type mapper tests                              |
| `packages/core/src/core/openaiContentGenerator.test.ts` | ~250  | 11 content generator tests                        |

### Fork-modified files

| File                         | Fork lines changed    | Conflict risk | Category                                                          |
| ---------------------------- | --------------------- | ------------- | ----------------------------------------------------------------- |
| **Core: OpenAI integration** |                       |               |                                                                   |
| `contentGenerator.ts`        | ~8 (after extraction) | HIGH          | AuthType enum + env detection + factory import                    |
| `index.ts`                   | 4 lines               | LOW           | Export additions                                                  |
| `package.json` (core)        | 1 line                | LOW           | `openai` dependency                                               |
| **Core: Multi-turn fixes**   |                       |               |                                                                   |
| `client.ts`                  | ~30 lines             | HIGH          | MAX_TOKENS bypass, null-default-continue, isToolResponseTurn gate |
| `geminiChat.ts`              | ~10 lines             | MEDIUM        | isGemini2Model guard removal (retry for all models)               |
| **CLI: Auth flow**           |                       |               |                                                                   |
| `initializer.ts`             | ~6 (after extraction) | MEDIUM        | Import + call to tryOpenAIAutoConnect                             |
| `AuthDialog.tsx`             | ~5 (after extraction) | MEDIUM        | Import + conditional routing                                      |
| `useAuth.ts`                 | 6 lines               | LOW           | Skip Google auth early-return                                     |
| `auth.ts`                    | 3 lines               | LOW           | OPENAI_COMPATIBLE validation case                                 |
| **CLI: Sandbox**             |                       |               |                                                                   |
| `config.ts`                  | ~20 lines             | MEDIUM        | YOLO auto-sandbox + skipNextSpeakerCheck                          |
| `sandboxConfig.ts`           | ~5 lines              | LOW           | bestEffort parameter                                              |
| `gemini.tsx`                 | ~20 lines             | MEDIUM        | YOLO sandbox + OpenAI auth guard                                  |
| `sandbox.ts`                 | ~20 lines             | LOW           | Env file mount + fork repo volume                                 |
| `sandboxUtils.ts`            | ~15 lines             | LOW           | Env sourcing + local clone detection                              |
| **CLI: Korean IME**          |                       |               |                                                                   |
| `InputPrompt.tsx`            | ~8 lines              | LOW           | getLatestText() calls                                             |
| `text-buffer.ts`             | ~20 lines             | MEDIUM        | getLatestText + latestLinesRef                                    |
| `KeypressContext.tsx`        | ~25 lines             | MEDIUM        | IME stdin reorder                                                 |
| **CLI: UI**                  |                       |               |                                                                   |
| `Footer.tsx`                 | ~5 lines              | LOW           | configuredSandbox fallback                                        |
| `useGeminiStream.ts`         | 5 lines               | LOW           | InvalidStream info message                                        |

---

## What Upstream Features the Fork Preserves

**All of them.** The fork is purely additive:

- Google OAuth / API Key / Vertex AI auth — fully functional
- All Gemini models — still the default path
- Sandbox (Docker/Podman/sandbox-exec/gVisor/LXC) — enhanced, not replaced
- All tools (shell, read, write, edit, grep, glob, web-fetch, MCP, etc.)
- All UI features (themes, vim mode, screen reader, footer, alternate buffer)
- Telemetry, logging, recording
- IDE integration (VS Code companion)
- Agent/A2A support
- Policy engine, billing, admin controls

If `OPENAI_BASE_URL` / `A2G_LOCATION` / `OPENROUTER_API_KEY` are not set, the
fork behaves identically to upstream.

---

## What Fork Features Might Conflict with Upstream Evolution

### High risk

1. **`contentGenerator.ts` changes** — If upstream adds new auth types,
   refactors the factory, or changes the `AuthType` enum, our additions will
   conflict. Mitigated by extraction to `openaiFactory.ts`.

2. **`client.ts` multi-turn changes** — The `nextSpeakerCheck` flow is
   upstream's active development area. Our `MAX_TOKENS` bypass and
   `null-default-continue` may conflict with upstream improvements.

### Medium risk

3. **`initializer.ts` changes** — Upstream may refactor the init flow. Mitigated
   by extraction to `openaiInitializer.ts`.

4. **`AuthDialog.tsx` changes** — Upstream may add new auth options. Mitigated
   by extraction to `OpenAIModelPicker.tsx`.

5. **`text-buffer.ts` / `KeypressContext.tsx` IME changes** — If upstream adds
   their own IME handling, it may conflict with ours.

### Low risk

6. **Sandbox changes** — Our `bestEffort` and YOLO auto-enable are localized.
7. **Export additions** — Append-only, unlikely to conflict.
8. **`useGeminiStream.ts` message** — Single line in a switch case.

### Possible upstream adoption

Some fork fixes address real bugs that affect all users:

- Korean IME character drop
- Empty response retry for non-Gemini models
- MAX_TOKENS auto-continue

If upstream adopts these, our fork changes can be removed, reducing the conflict
surface.
