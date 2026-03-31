# Model Configuration

The gemini-cli fork loads its LLM model registry from `models.default.json` at
the repo root. To add, remove, or modify models, edit that file — no code
changes needed.

---

## Config File

`models.default.json` at the repo root. On startup, `llmRegistry.ts` reads it.
If the file is missing or unparseable, a minimal gpt-4o fallback is used.

## Quick Start

```bash
# Just run — models are loaded from models.default.json
gemini

# To add a model, edit the config
vim models.default.json
```

## Config Format

```json
{
  "models": [
    {
      "model": "my-model-name",
      "url": "http://my-server:8000/v1",
      "contextLength": 128000,
      "maxTokens": 32768,
      "reasoningModel": true,
      "corp": true
    }
  ]
}
```

### Field Reference

| Field                  | Type          | Required | Default         | Description                                |
| ---------------------- | ------------- | -------- | --------------- | ------------------------------------------ |
| `model`                | string        | yes      |                 | Display name in model picker               |
| `url`                  | string        | yes      |                 | OpenAI-compatible API base URL             |
| `contextLength`        | number        | yes      |                 | Max context window (tokens)                |
| `maxTokens`            | number        | no       | = contextLength | Max generation tokens                      |
| `modelAlias`           | string        | no       |                 | Actual model ID sent to the API            |
| `modality`             | object        | no       |                 | `{input: [...], output: [...]}`            |
| `apiKeyEnv`            | string        | no       |                 | Env var name for API key                   |
| `corp`                 | boolean       | no       | false           | Show in CORP environment                   |
| `home`                 | boolean       | no       | false           | Show in HOME environment                   |
| `dev`                  | boolean       | no       | false           | Show in DEV environment                    |
| `supportsResponsesApi` | boolean       | no       | false           | Supports OpenAI Responses API              |
| `reasoningModel`       | boolean       | no       | false           | Reasoning/thinking-capable model           |
| `extraBody`            | object        | no       |                 | Non-standard API params                    |
| `defaultHeaders`       | object/string | no       |                 | Custom HTTP headers (or `"__corp_auth__"`) |

## Environment Detection

`detectLocation()` reads `A2G_LOCATION` and maps it:

| Env Value                       | Environment | Models shown             |
| ------------------------------- | ----------- | ------------------------ |
| `COMPANY`, `PRODUCTION`, `CORP` | CORP        | Models with `corp: true` |
| `DEVELOPMENT`, `DEV`            | DEV         | Models with `dev: true`  |
| `HOME` (or unset)               | HOME        | Models with `home: true` |

If unset, checks hostname patterns (`prod`, `company`, `server` → CORP),
defaults to HOME.

## Special Handling: Corp Auth Headers

The GaussO model requires dynamic HTTP headers computed from env vars at
runtime. Set `"defaultHeaders": "__corp_auth__"` in the config — the TypeScript
loader detects this marker and installs a lazy getter that computes headers from
`FALLBACK_API_KEY_1` and `AD_ID` on each access.

## Python LLM Helper

A lightweight helper (`scripts/fork/gemini_llm.py`) lets you use models from
`models.default.json` with vanilla `langchain_openai.ChatOpenAI`:

```python
# pip install langchain-openai
import sys; sys.path.insert(0, "scripts/fork")
from gemini_llm import from_model, list_models

list_models()                          # Show models for your environment
llm = from_model("GLM-5-Thinking")     # Get a configured ChatOpenAI
llm.invoke("Hello")                    # Use it
```

## Key Files

| File                                      | Role                                         |
| ----------------------------------------- | --------------------------------------------- |
| `models.default.json`                     | Model config (repo root, edit this)           |
| `packages/core/src/config/llmRegistry.ts` | JSON loader, env detection, public API (TS)   |
| `scripts/fork/gemini_llm.py`              | Lightweight Python helper for LangChain users |
