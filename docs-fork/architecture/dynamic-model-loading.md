# Dynamic Model Loading

The gemini-cli fork dynamically loads its LLM model registry from the Python
`a2g_models` package at startup. Changes to the Python registry are reflected
immediately — no TypeScript edits or manual export steps needed.

---

## Architecture

```
                         startup
                            |
                            v
+-------------------+    execSync     +-------------------------+
| llmRegistry.ts    | ------------->  | export_llm_registry.py  |
| (TypeScript)      |                 | (Python via uv run)     |
+-------------------+                 +-------------------------+
        |                                       |
        |  reads JSON                           |  imports & dumps
        v                                       v
+-------------------+                 +-------------------------+
| llm_registry.json |  <------------ | a2g_models/registries/  |
| (auto-generated)  |    writes       | llm_registries.py       |
+-------------------+                 +-------------------------+
        |
        v
  Model Picker UI
  (filtered by location)
```

## Registry Mode (`GEMINI_LLM_REGISTRY_MODE`)

The `GEMINI_LLM_REGISTRY_MODE` environment variable controls how the model
registry is loaded at startup:

| Value     | Behavior                                                          |
| --------- | ----------------------------------------------------------------- |
| `dynamic` | (default) Run Python export script via `uv run`, load fresh JSON  |
| `static`  | Skip Python/uv entirely, use hardcoded model arrays (fast startup)|

```bash
# Use static registry (no Python dependency, faster startup)
GEMINI_LLM_REGISTRY_MODE=static gemini

# Use dynamic registry (default — always fresh from Python source)
GEMINI_LLM_REGISTRY_MODE=dynamic gemini
```

## Flow

1. **Startup** — `llmRegistry.ts` module loads
2. **Auto-export** — `refreshRegistryJson()` runs
   `uv run ... python export_llm_registry.py` via `execSync` from the
   `a2g_models` project directory
3. **JSON written** — The Python script imports `LLMRegistry._models`, converts
   all models to camelCase JSON, writes to
   `~/workspace/main/research/a2g_packages/envs/llm_registry.json`
4. **JSON loaded** — TypeScript reads and parses the JSON file
5. **Fallback** — If Python/uv is unavailable (e.g., CI, fresh machine), falls
   back to hardcoded models in `llmRegistry.ts`

## Key Files

| File                                                   | Role                                       |
| ------------------------------------------------------ | ------------------------------------------ |
| `packages/core/src/config/llmRegistry.ts`              | Runtime loader, environment detection, API |
| `scripts/fork/export_llm_registry.py`                  | Python script that dumps registry to JSON  |
| `~/...a2g_packages/envs/llm_registry.json`             | Auto-generated intermediate JSON           |
| `~/...a2g_models/registries/llm_registries.py`         | Python source of truth (all models)        |
| `~/...a2g_models/registries/default_registries/`       | Default models (OpenAI, Anthropic)         |
| `~/...a2g_models/configurations/llm_configurations.py` | `LLMConfig` Pydantic model                 |

## Environment Detection

Both Python (`detect_location()`) and TypeScript (`detectLocation()`) use the
same logic:

1. Read `PROJECT_A2G_LOCATION` env var
2. Map: `COMPANY`/`PRODUCTION`/`CORP` → `CORP`, `DEVELOPMENT`/`DEV` → `DEV`,
   `HOME` → `HOME`
3. If unset, check hostname patterns (`prod`, `company`, `server` → `CORP`)
4. Default: `HOME`

The model picker shows only models where the matching location flag is `true`
(e.g., `home=True` for HOME environment).

## Field Mapping (Python → TypeScript)

| Python (`LLMConfig`)     | JSON / TypeScript (`LLMModelConfig`) | Notes                           |
| ------------------------ | ------------------------------------ | ------------------------------- |
| `model`                  | `model`                              | Model name / identifier         |
| `model_alias`            | `modelAlias`                         | Actual name sent to API         |
| `url`                    | `url`                                | API endpoint base URL           |
| `modality`               | `modality`                           | `{input: [...], output: [...]}` |
| `api_key_env`            | `apiKeyEnv`                          | Env var name for API key        |
| `context_length`         | `contextLength`                      | Max context window (tokens)     |
| `max_tokens`             | `maxTokens`                          | Max generation tokens           |
| `corp`                   | `corp`                               | Available in CORP environment   |
| `home`                   | `home`                               | Available in HOME environment   |
| `dev`                    | `dev`                                | Available in DEV environment    |
| `supports_responses_api` | `supportsResponsesApi`               | Supports OpenAI Responses API   |
| `reasoning_model`        | `reasoningModel`                     | Reasoning-capable model         |
| `extra_body`             | `extraBody`                          | Non-standard API params         |
| `default_headers`        | `defaultHeaders`                     | Custom HTTP headers             |

## Special Handling: Corp Auth Headers

The GaussO model requires dynamic HTTP headers computed from env vars at
runtime. The Python export script writes `"__corp_auth__"` as a marker instead
of actual header values. The TypeScript loader detects this marker and installs
a lazy getter via `Object.defineProperty` that computes headers from
`PROJECT_FALLBACK_API_KEY_1` and `PROJECT_AD_ID` on each access.

## Typical Workflow

```bash
# 1. Edit models in Python
vim ~/workspace/main/research/a2g_packages/src/a2g_models/registries/llm_registries.py

# 2. Just start gemini — changes are picked up automatically
gemini
```

No rebuild, no export script, no JSON editing. The registry is always fresh.

## Manual Export (Optional)

If you need to pre-generate the JSON without starting gemini:

```bash
cd ~/workspace/main/research/a2g_packages/src/a2g_models
uv run --native-tls --env-file ~/workspace/main/research/a2g_packages/envs/.env \
  python ~/workspace/gemini-cli-fork/scripts/fork/export_llm_registry.py
```

## Fallback Behavior

If the auto-export fails (Python/uv not installed, venv broken, etc.):

1. If a previous `llm_registry.json` exists → uses that (stale but functional)
2. If no JSON exists → uses hardcoded models in `llmRegistry.ts`

The hardcoded models serve as a safety net and should be periodically updated to
match the Python source.
