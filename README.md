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

Pick a model and start coding. That's it.

---

## Setup (5 minutes)

### Step 1: Install Node.js

You need **Node.js 20 or newer**. Check with:

```bash
node --version   # should print v20.x.x or higher
```

If not installed, ask your team lead or install via
[nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 20
```

> **Company network?** You may need `npm config set strict-ssl false` before
> `npm install`.

### Step 2: Clone and install

```bash
git clone https://github.com/Taekyo-Lee/gemini-cli-fork.git
cd gemini-cli-fork
npm install --ignore-scripts
```

### Step 3: Configure your `.env`

Copy the template and fill in your values:

```bash
cp .env.example .env
```

Then open `.env` in any editor and fill in the fields. Here's what each section
means:

| Variable             | What to put                                              | Required? |
| -------------------- | -------------------------------------------------------- | --------- |
| `GEMINI_FORK_DIR`    | Path to this repo (auto-set by the setup script)         | Auto      |
| `OPENAI_API_KEY`     | Your OpenAI API key (`sk-...`)                           | If using OpenAI |
| `ANTHROPIC_API_KEY`  | Your Anthropic API key (`sk-ant-...`)                    | If using Anthropic |
| `OPENROUTER_API_KEY` | Your OpenRouter API key (`sk-or-...`)                    | If using OpenRouter |
| `A2G_LOCATION`       | Your environment: `CORP`, `DEV`, or `HOME`               | Yes       |
| `AD_ID`              | Your AD username (e.g., `hong.gildong`)                  | CORP only |
| `FALLBACK_API_KEY_1` | Corp auth token (`system_name/dep_ticket`)               | CORP only |
| `LANGFUSE_*`         | Langfuse keys for tracing (see [Telemetry](#telemetry))  | Optional  |

> **Note:** You do NOT need `*_API_BASE` URLs. Base URLs come from each model's
> config in `models.default.json`. Only API keys are needed here.

**Which `A2G_LOCATION` am I?**

- **`CORP`** — You're on the company network and want to use on-prem models
  (GLM-5, Kimi, Qwen, etc.)
- **`DEV`** or **`HOME`** — You're using public APIs (OpenAI, Anthropic,
  OpenRouter)

You only need API keys for providers you actually use. For example, if you only
use on-prem CORP models, you don't need `OPENAI_API_KEY` at all.

### Step 4: Build, link, and activate

Run the setup script:

```bash
./scripts/fork/link_global.sh
```

This does everything in one shot:

1. Builds the project
2. Links the `gemini` command globally (works from any directory)
3. Sets `GEMINI_FORK_DIR` in your `.env`
4. Adds `.env` sourcing to your `~/.bashrc` (so env vars load in every terminal)

Then activate for your current terminal:

```bash
source ~/.bashrc
```

### Step 5: Run

```bash
gemini
```

You should see a model picker. Select a model and start chatting.

**One-shot mode** (no interactive UI):

```bash
gemini -p "explain this error" < error.log
```

**Select a specific model:**

```bash
gemini -m "GLM-5-Thinking"
gemini -m "gpt-5" -p "write a hello world in python"
```

---

## After Setup

### Updating

When the fork is updated:

```bash
cd $GEMINI_FORK_DIR
git pull
./scripts/fork/link_global.sh
```

### Verify your setup

```bash
./scripts/fork/link_global.sh --verify
```

This checks that the build exists, the `gemini` command points to the fork, and
prints the version.

### Rebuilding after code changes

```bash
# Full rebuild + relink:
./scripts/fork/link_global.sh

# Quick rebuild only (link persists):
cd $GEMINI_FORK_DIR && npm run build
```

---

## Available Models

Models are defined in `models.default.json` at the repo root. The model picker
only shows models available in your environment.

| Environment        | Models                                                    | Provider             |
| ------------------ | --------------------------------------------------------- | -------------------- |
| **CORP** (on-prem) | GLM-5-Thinking, Kimi-K2.5, Qwen3.5, gpt-oss-120b, ...   | vLLM behind firewall |
| **DEV / HOME**     | DeepSeek-V3.2, DeepSeek-R1, Claude-4-Sonnet, ...         | OpenRouter           |
| **All**            | GPT-5, GPT-4.1, o3, o4-mini, Claude-4-Opus, ...          | OpenAI, Anthropic    |

---

## Telemetry

If your team runs a self-hosted [Langfuse](https://langfuse.com/) instance, you
can trace all LLM calls automatically. **No data leaves your network.**

Add these to your `.env`:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3000
```

That's it — traces appear in your Langfuse dashboard. If any key is missing,
telemetry stays off silently.

See `docs/fork/tracing/telemetry.md` for details.

---

## YOLO Mode (Auto-Sandbox)

Run with automatic tool execution inside a Docker sandbox:

```bash
gemini --yolo
```

If Docker isn't available, it continues without sandbox rather than crashing.

---

## Using with Google Gemini (upstream mode)

If you **don't** set `A2G_LOCATION`, `OPENROUTER_API_KEY`, or `OPENAI_BASE_URL`,
the CLI falls back to the original Google auth flow:

```bash
unset A2G_LOCATION OPENROUTER_API_KEY OPENAI_BASE_URL
gemini   # -> Google OAuth / API key / Vertex AI
```

---

## Python Integration

Use models from this registry in your Python code:

```python
import sys; sys.path.insert(0, f"{os.environ['GEMINI_FORK_DIR']}/scripts/fork")
from gemini_llm import from_model, list_models

list_models()                          # Show models for your environment
llm = from_model("GLM-5-Thinking")     # Get a configured LangChain ChatOpenAI
llm.invoke("Hello")                    # Use it
```

Requires: `pip install langchain-openai`

---

## Troubleshooting

### `gemini: command not found`

Run the setup script again:

```bash
cd /path/to/gemini-cli-fork
./scripts/fork/link_global.sh
source ~/.bashrc
```

### `npm install` fails with SSL errors

On corporate networks:

```bash
npm config set strict-ssl false
npm install --ignore-scripts
```

### No models shown / wrong models

Check your `A2G_LOCATION` value in `.env`:

```bash
echo $A2G_LOCATION   # should print CORP, DEV, or HOME
```

If empty, run `source ~/.bashrc` or open a new terminal.

### API key errors

Make sure you set the right key for your provider. The CLI reads keys based on
the model's URL:

| Provider URL contains | Key variable         |
| --------------------- | -------------------- |
| `anthropic.com`       | `ANTHROPIC_API_KEY`  |
| `openrouter.ai`       | `OPENROUTER_API_KEY` |
| Everything else       | `OPENAI_API_KEY`     |

CORP models don't need API keys — they use `AD_ID` and `FALLBACK_API_KEY_1`.

---

## How It Works

The fork plugs in through Gemini CLI's `ContentGenerator` interface:

```
Startup -> env detection -> Model Picker (fork) or Google Auth (upstream)
                                |
                                v
                    OpenAIContentGenerator
                         |         |
              openaiTypeMapper    OpenAI SDK
              (Gemini <> OpenAI)  (Chat Completions API)
                                   |
                                   v
                         Any compatible endpoint
```

The rest of the CLI — tool execution, prompt construction, UI rendering — is
unchanged. It consumes the `ContentGenerator` interface and doesn't care which
backend is active.

---

## Documentation

| Path                        | Contents                                     |
| --------------------------- | -------------------------------------------- |
| `docs/fork/overview/`       | Fork philosophy, fork-vs-upstream comparison |
| `docs/fork/setup/`          | Install guide, troubleshooting               |
| `docs/fork/architecture/`   | OpenAI-compatible mode, model registry       |
| `docs/fork/tracing/`        | Telemetry setup, Langfuse integration        |
| `docs/fork/upstream/`       | Sync guide, merge history                    |
| `docs/fork/tracking/`       | TODO, changelog                              |

---

## License

[Apache License 2.0](LICENSE) — same as upstream.

Upstream: [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
