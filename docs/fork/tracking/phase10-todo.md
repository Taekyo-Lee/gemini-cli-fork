# Phase 10 TODO: Lightweight Python LLM Helper

## Overview

Single-file Python helper for coworkers to use `models.default.json` with
vanilla `langchain_openai.ChatOpenAI`. See `phase10-plan.md` for full design.

---

## Phase 10.1: Research & Preparation

- [x] **Verify corp auth header format** — 4 headers: `x-dep-ticket`,
      `Send-System-Name` (from `FALLBACK_API_KEY_1` split by `/`), `User-Id`
      (`AD_ID`), `User-Type` (literal `"AD_ID"`)
- [x] **Review env detection logic** — `A2G_LOCATION`: COMPANY/PRODUCTION/CORP
      -> corp, DEVELOPMENT/DEV -> dev, HOME -> home. Hostname fallback to corp
      if contains prod/company/server, else home.
- [x] **Check `models.default.json` schema** — all fields mapped: model, modelAlias,
      url, apiKeyEnv, contextLength, maxTokens, corp/home/dev, extraBody,
      defaultHeaders

## Phase 10.2: Implement `gemini_llm.py`

- [x] **Core model loading** — `_find_models_json()` walks up from script dir,
      with `GEMINI_CLI_MODELS_JSON` env var override
- [x] **Environment detection** — `detect_environment()` matches TypeScript logic
- [x] **Model filtering** — `list_models()` filters by env key
- [x] **`from_model(name, **kwargs)`** — full factory with:
  - Model lookup with helpful error (shows available models)
  - API key resolution: `apiKeyEnv` -> `OPENAI_API_KEY` -> empty
  - `modelAlias` mapping for API call
  - `extra_body`, `default_headers` passthrough
  - `__corp_auth__` sentinel resolution
  - User kwargs override
- [x] **`list_models()`** — formatted table with model name, context, URL
- [x] **User kwargs passthrough** — temperature, max_completion_tokens, etc.

## Phase 10.3: Testing & Documentation

- [x] **Syntax check** — passes `ast.parse()`
- [x] **Model loading test** — 27 models loaded from repo root
- [x] **list_models() test** — DEV shows 19 models, CORP shows 8 models
- [x] **Usage examples** — comprehensive docstring with invoke/stream/kwargs
- [x] **Live LLM test** — gpt-4o-mini: invoke, stream, and kwargs all pass
- [x] **Update `docs/fork/tracking/todo.md`** — Phase 10 entry added

## Phase 10.4: Cleanup

- [x] **Remove `a2g_models` references** — deleted `on_prem_llms_test/`,
      `export_llm_registry.py`; updated CLAUDE.md, README.md, openaiFactory.ts,
      OpenAIModelPicker.tsx, test_openai_adapter.sh, dynamic-model-loading.md,
      model-registry-reference.md, todo.md
- [x] **`GEMINI_CLI_MODELS_JSON` env var** — implemented in `_find_models_json()`
- [x] **Pretty-print `list_models()`** — table format with `#`, model, context, URL
- [ ] **Env file loading** — optional `dotenv` support for `~/.env` (deferred)
