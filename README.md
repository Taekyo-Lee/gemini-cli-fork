# Gemini CLI Fork — Multi-LLM Edition

A fork of [Google's Gemini CLI](https://github.com/google-gemini/gemini-cli)
that works with **any OpenAI-compatible LLM** — on-prem vLLM, OpenRouter,
OpenAI, Anthropic, and more.

```
$ gemini
  > GLM-5-Thinking          (on-prem, 157K context)
    Kimi-K2.5-Non-Thinking   (on-prem, 262K context)
    dev-DeepSeek-V3.2        (OpenRouter)
    gpt-5                    (OpenAI)
    ...
```

One command, 27+ models, three environments. Pick and go.

---

## Why This Fork?

The upstream Gemini CLI only works with Google's Gemini models. This fork adds:

- **Model picker** — replaces the Google auth prompt with a model selection list
- **Any OpenAI-compatible endpoint** — on-prem vLLM, OpenRouter, OpenAI direct,
  Anthropic, LiteLLM
- **Environment-aware** — auto-detects CORP/DEV/HOME via `A2G_LOCATION` and
  shows only reachable models
- **YOLO sandbox** — `--yolo` auto-enables Docker sandbox with best-effort
  fallback
- **Korean IME fix** — proper handling of composing characters in terminal input
- **Universal retry** — mid-stream retry for all models, not just Gemini 2

Everything else is upstream Gemini CLI — same tools, same UI, same features. If
you unset the OpenAI env vars, it behaves identically to the original.

---

## Quick Start

### Prerequisites

- Node.js >= 20
- API keys for your LLM provider(s)

### Install & Run

```bash
git clone https://github.com/Taekyo-Lee/gemini-cli-fork.git
cd gemini-cli-fork
npm install --ignore-scripts
npm run build
node packages/cli
```

### Configure

Set your environment and API keys. The env file at `~/.env` is the default
location.

Key env vars:

```bash
# Environment detection (CORP, DEV, or HOME)
A2G_LOCATION="HOME"

# Provider API keys (set the ones you need)
OPENAI_API_KEY="sk-..."
OPENAI_API_BASE="https://api.openai.com/v1"
OPENROUTER_API_KEY="sk-or-..."
OPENROUTER_API_BASE="https://openrouter.ai/api/v1"
ANTHROPIC_API_KEY="sk-ant-..."
```

### Use with Google (upstream mode)

Don't set any of the above env vars. The CLI falls back to standard Google auth:

```bash
gemini   # → Google OAuth / API key / Vertex AI
```

---

## Supported Models

Models are defined in `models.default.json` at the repo root, loaded by
`llmRegistry.ts` at startup.

| Environment        | Models                                                   | Providers            |
| ------------------ | -------------------------------------------------------- | -------------------- |
| **CORP** (on-prem) | GLM-5-Thinking, Kimi-K2.5, Qwen3-235B, gpt-oss-120b, ... | vLLM behind firewall |
| **DEV/HOME**       | DeepSeek-V3.2, DeepSeek-R1, Claude-4-Sonnet, ...         | OpenRouter           |
| **All**            | GPT-5, GPT-4.1, o3, o4-mini, Claude-4-Opus, ...          | OpenAI, Anthropic    |

---

## How It Works

The fork plugs in through Gemini CLI's `ContentGenerator` interface:

```
Startup → env detection → Model Picker (fork) or Google Auth (upstream)
                                │
                                ▼
                    OpenAIContentGenerator
                         │         │
              openaiTypeMapper    OpenAI SDK
              (Gemini ↔ OpenAI)   (Chat Completions API)
                                   │
                                   ▼
                         Any compatible endpoint
```

The rest of the CLI — tool execution, prompt construction, UI rendering — is
unchanged. It consumes the `ContentGenerator` interface and doesn't know which
backend is active.

---

## Fork-Specific Features

### YOLO Mode with Auto-Sandbox

```bash
gemini --yolo
```

Auto-detects Docker and enables sandboxed tool execution. If Docker isn't
available, continues without sandbox (best-effort) rather than crashing.

### Korean IME Support

Terminal input correctly handles composing Korean characters. The
`getLatestText()` function reads the latest composed text from the stdin buffer,
preventing character drops during composition.

### Universal Multi-Turn Fixes

- `MAX_TOKENS` stop reason triggers auto-continue (not just Gemini models)
- `null` default continue for non-Gemini models
- Mid-stream retry for all models (upstream limits this to Gemini 2)

---

## Development

```bash
npm install --ignore-scripts       # Install dependencies
npm run build                      # Build all packages
npm start                          # Dev mode
npm test                           # All unit tests
npm run typecheck                  # TypeScript check
npm run build && node packages/cli # Quick rebuild & run
```

---

## Upstream Sync

This fork syncs with stable upstream releases (not nightlies or previews).

```bash
./scripts/fork/upstream-sync.sh    # Check for new stable release & run conflict analysis
./scripts/fork/verify-fork-features.sh  # Verify fork features after merge
```

See `docs/fork/upstream/upstream-sync-guide.md` for the full process and
`docs/fork/upstream/merge-history.md` for the merge log.

---

## Documentation

| Document                  | Contents                                     |
| ------------------------- | -------------------------------------------- |
| `docs/fork/overview/`     | Fork philosophy, fork-vs-upstream comparison |
| `docs/fork/setup/`        | Install guide, troubleshooting               |
| `docs/fork/architecture/` | OpenAI-compatible mode, model registry       |
| `docs/fork/upstream/`     | Sync guide, merge history                    |
| `docs/fork/tracking/`     | TODO, changelog                              |

For upstream Gemini CLI docs, see `docs/` or
[geminicli.com](https://geminicli.com/docs/).

---

## License

[Apache License 2.0](LICENSE) — same as upstream.

Upstream:
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
