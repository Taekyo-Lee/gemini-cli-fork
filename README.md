# Gemini CLI Fork — Multi-Model Terminal Agent

> A fork of [Google's Gemini CLI](https://github.com/google-gemini/gemini-cli)
> extended to work with **any OpenAI-compatible LLM** — on-prem models (GLM,
> Kimi, Qwen, GaussO), cloud APIs (OpenRouter, OpenAI, Anthropic), and the
> original Gemini models.

![Gemini CLI Screenshot](./docs/assets/gemini-screenshot.png)

## Why This Fork?

The upstream Gemini CLI is locked to Google's Gemini models. This fork adds a
**model picker** that lets you choose from 27+ LLMs across three environments,
all connected via the OpenAI Chat Completions API.

```
$ gemini

  Select a model:
  > dev-DeepSeek-V3.2
    dev-claude-haiku-4.5
    dev-Gemini-3.1-Pro-Preview
    dev-Claude-Opus-4.6
    gpt-4.1
    gpt-5
    ...
```

**What changed:** `$ gemini` shows an LLM selection list (not a Google auth
prompt), connects to the selected model, and gives you the same tool-calling,
file-editing, shell-executing agent experience — but with the model of your
choice.

**What didn't change:** All upstream features — file operations, shell commands,
MCP servers, Google Search grounding, checkpointing, GEMINI.md context files,
non-interactive mode — work exactly as before.

## Supported Models

Models are filtered by environment (set via `PROJECT_A2G_LOCATION` env var):

| Environment    | Models                                                           | Endpoint      |
| -------------- | ---------------------------------------------------------------- | ------------- |
| **DEV / HOME** | DeepSeek V3.2, Claude Haiku 4.5, Claude Opus 4.6, Gemini 3.1 Pro | OpenRouter    |
| **DEV / HOME** | GPT-4o, GPT-4.1, GPT-5, o1, o3-mini, o4-mini (12 models)         | OpenAI direct |
| **CORP**       | GLM-5, Kimi-K2.5, Qwen3.5, gpt-oss-120b, GaussO (8 models)       | On-prem       |

Full registry:
[`packages/core/src/config/llmRegistry.ts`](./packages/core/src/config/llmRegistry.ts)

## Quick Start

### Prerequisites

- **Node.js >= 20** (`node --version`)
- **API keys** in env file at `~/workspace/main/research/a2g_packages/envs/.env`

### Install & Run

```bash
# Clone and build
cd ~/workspace/gemini-cli-fork
npm install
npm run build

# Link globally (so `gemini` works from anywhere)
npm link ./packages/cli

# Load env vars and run
set -a && source ~/workspace/main/research/a2g_packages/envs/.env && set +a
gemini
```

Select a model from the picker and start chatting.

For detailed setup (Node.js upgrade, troubleshooting, switching modes), see the
**[Install Guide](./INSTALL_GUIDE.md)**.

## Usage

Works the same as upstream Gemini CLI, with any model:

```bash
# Interactive mode — opens model picker, then chat
gemini

# One-shot prompt
gemini -p "Explain the architecture of this codebase"

# JSON output for scripting
gemini -p "List all TODO items" --output-format json

# Include additional directories
gemini --include-directories ../lib,../docs
```

### Google Auth Mode (Original)

If no OpenAI trigger env vars are set, the CLI falls back to the original Gemini
auth flow — Login with Google, API Key, or Vertex AI. See
[upstream docs](https://github.com/google-gemini/gemini-cli) for details.

## Architecture

This is a monorepo using npm workspaces:

| Package         | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| `packages/cli`  | Terminal UI (React + Ink), model picker, entry point      |
| `packages/core` | LLM orchestration, OpenAI adapter, tool execution, config |
| `packages/sdk`  | SDK for programmatic use                                  |

**Key files added by this fork:**

| File                                                                                                     | Purpose                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [`packages/core/src/config/llmRegistry.ts`](./packages/core/src/config/llmRegistry.ts)                   | Model registry (27 models, 3 environments) |
| [`packages/core/src/core/openaiContentGenerator.ts`](./packages/core/src/core/openaiContentGenerator.ts) | ContentGenerator impl using OpenAI SDK     |
| [`packages/core/src/core/openaiTypeMapper.ts`](./packages/core/src/core/openaiTypeMapper.ts)             | Gemini <-> OpenAI type conversion          |

The adapter implements the `ContentGenerator` interface, translating between
Gemini's types (`@google/genai`) and OpenAI's Chat Completions API. The rest of
the CLI (tool execution, prompt construction, UI rendering) works unchanged.

## Features (Inherited from Upstream)

All upstream Gemini CLI features work with any model:

- **File operations** — read, write, edit files in your codebase
- **Shell commands** — execute terminal commands with confirmation
- **MCP servers** — extend with custom tools (`@github`, `@slack`, etc.)
- **Google Search grounding** — ground queries with real-time search results
- **Checkpointing** — save and resume conversations
- **Context files** — `GEMINI.md` for project-specific instructions
- **Non-interactive mode** — scripting with `-p` flag and JSON output
- **Themes** — customizable terminal UI

See the upstream [documentation](https://github.com/google-gemini/gemini-cli)
for full feature reference.

## Current Status

**Working:** Single-turn conversations, model picker, streaming responses, basic
tool calling.

**Known issues:** Multi-turn tool-calling conversations have bugs due to global
state in the type mapper. See [TODO.md](./TODO.md) Phase 7 for the full list of
16 tracked issues and fixes.

## Development

```bash
npm run build      # Build all packages
npm test           # Run all tests
npm run typecheck  # TypeScript checks
npm run lint       # ESLint

# Quick rebuild and run
npm run build && node packages/cli

# Or use the test script
./scripts/test_openai_adapter.sh --quick
```

## License

Apache 2.0 — same as upstream. See [LICENSE](./LICENSE).

---

Based on [Google Gemini CLI](https://github.com/google-gemini/gemini-cli).
