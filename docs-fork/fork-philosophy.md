# Fork Philosophy — Why This Exists

## The Problem

Modern AI coding assistants are locked to a single provider. Claude Code only
works with Anthropic. Cursor routes through their own backend. The upstream
Gemini CLI only works with Google's Gemini models. If your company runs on-prem
LLMs behind a firewall, or you want to switch between GPT-5 and DeepSeek
depending on the task, you're out of luck.

This fork exists because **the best coding assistant is the one that works with
the model you need, wherever it runs.**

## Core Principles

### 1. Any Model, One Interface

You shouldn't need to learn a different tool for each LLM provider. This fork
gives you the same terminal agent experience — file editing, shell commands, tool
calling, context management — regardless of whether the model runs on an on-prem
vLLM server, OpenRouter, OpenAI, or Anthropic.

The model picker replaces the auth prompt:

```
$ gemini
  > GLM-5-Thinking          (on-prem, 157K context)
    Kimi-K2.5-Non-Thinking   (on-prem, 262K context)
    dev-DeepSeek-V3.2        (OpenRouter)
    gpt-5                    (OpenAI)
    ...
```

One command, 27+ models, three environments. Pick and go.

### 2. Environment-Aware Model Discovery

Not all models are available everywhere. Corporate networks have on-prem vLLM
endpoints. Home machines have OpenRouter and OpenAI API keys. The fork
auto-detects your environment via the `PROJECT_A2G_LOCATION` env var and shows
only the models you can actually use:

| Location      | What You See                                     |
| ------------- | ------------------------------------------------ |
| `CORP`        | On-prem models (GLM-5, Kimi, Qwen, gpt-oss-120b) |
| `DEV` / `HOME`| OpenRouter + OpenAI models                        |

This prevents the frustration of selecting a model that won't connect.

### 3. Zero Upstream Breakage

The fork follows a strict **additive-only** rule. No upstream code paths are
modified — only new branches are added. The `ContentGenerator` interface is the
key abstraction: the upstream Gemini implementation and our `OpenAIContentGenerator`
both implement it. Everything downstream (tool execution, prompt construction,
UI rendering) is unaware of which provider is active.

If you unset the OpenAI env vars, the CLI behaves exactly like upstream Gemini
CLI — Google auth, Gemini models, everything intact.

### 4. OpenAI Chat Completions as the Universal Protocol

Rather than implementing a custom adapter for each provider, the fork uses the
**OpenAI Chat Completions API** as the common protocol. This single integration
covers:

- **OpenAI** direct (GPT-4o, GPT-5, o-series)
- **OpenRouter** (DeepSeek, Claude, Gemini, 200+ models)
- **vLLM** on-prem (GLM-5, Kimi, Qwen, any HuggingFace model)
- **LiteLLM** proxy (unified gateway to any provider)
- **Anthropic** (via OpenAI-compatible endpoint)

One adapter, many providers. When a new LLM launches, adding it to the registry
is the only change needed — no new adapter code.

### 5. Graceful Degradation Over Hard Failures

The fork prefers silent fallback over crashes:

- **API key resolution** follows a chain: model-specific key -> project key ->
  generic key -> empty (let the server decide)
- **Sandbox auto-enable** in YOLO mode uses best-effort: if Docker isn't
  available, continue without sandbox rather than crash
- **Streaming tool calls** have a safety net: if the accumulated JSON is garbled
  (common with vLLM/GLM-5), extract the last valid JSON object instead of
  failing
- **Model selection** remembers your last choice and falls back to the first
  available model if that choice is no longer valid

### 6. YOLO Mode Means YOLO

When you pass `--yolo`, you mean it. The fork ensures:

- **Sandbox auto-enables** — Docker is detected and used automatically to
  isolate tool execution, without requiring explicit `--sandbox`
- **No silent downgrades** — The folder trust system does not secretly override
  YOLO to DEFAULT. If you asked for YOLO, you get YOLO.
- **Env vars forwarded** — Inside the Docker sandbox, your API keys and model
  config are available via the mounted env file, so the model picker works
  identically inside and outside the container.

### 7. Single Source of Truth for Models

The Python `a2g_models` package
(`~/workspace/main/research/a2g_packages/src/a2g_models/`) is the authoritative
model registry. The TypeScript registry (`llmRegistry.ts`) mirrors it. Both
define the same 27 models with the same URLs, API key env vars, context lengths,
and environment flags.

When a new model is deployed on the on-prem vLLM server, adding it to both
registries is all that's needed.

## What This Fork Is Not

- **Not a new CLI.** It's Gemini CLI with a broader model backend. The UI, tool
  system, and workflow are identical to upstream.
- **Not a proxy or middleware.** The CLI talks directly to LLM endpoints. There's
  no intermediary service to deploy.
- **Not a model evaluator.** The fork doesn't compare models or rank them. It
  lets you pick the model you want and gets out of the way.

## Architecture in One Paragraph

On startup, env detection routes to either Google auth (upstream) or the model
picker (fork). The model picker queries the `llmRegistry` for available models
filtered by environment. On selection, an `OpenAIContentGenerator` is created
with the model's endpoint, API key, and config. This generator implements the
same `ContentGenerator` interface as Google's implementation, translating between
Gemini's types and OpenAI's Chat Completions API via `openaiTypeMapper`. From
that point on, the rest of the CLI — `geminiChat`, tool execution, prompt
construction, UI rendering — works unchanged.

## Related Documentation

| Document | What It Covers |
| --- | --- |
| [README.md](../README.md) | Quick overview, supported models, quick start |
| [install-guide.md](./install-guide.md) | Step-by-step setup, troubleshooting |
| [openai-compatible.md](./openai-compatible.md) | Technical deep-dive: env detection, auth flow, API mapping |
| [model-registry-reference.md](./model-registry-reference.md) | Complete model tables with specs |
| [todo.md](./todo.md) | Implementation phases, bug fixes, current status |
