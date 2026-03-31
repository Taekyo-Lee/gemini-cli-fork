# Phase 10.5 TODO: Multi-Provider Routing (COMPLETE)

## Overview

Extend `gemini_llm.py` to route models to native LangChain classes based on
their API endpoint URL. Also fix API key auto-detection in both Python and
TypeScript to infer the correct key from the URL.

| URL pattern | LangChain class | pip package | Default API key env |
|---|---|---|---|
| `api.openai.com` | `ChatOpenAI` | `langchain-openai` | `OPENAI_API_KEY` |
| `api.anthropic.com` | `ChatAnthropic` | `langchain-anthropic` | `ANTHROPIC_API_KEY` |
| `openrouter.ai` | `ChatOpenRouter` | `langchain-openrouter` | `OPENROUTER_API_KEY` |
| Other (vLLM, corp) | `ChatOpenAI` | `langchain-openai` | `OPENAI_API_KEY` |

---

## Phase 10.5.1: Implement Provider Routing (Python)

- [x] **Add `_detect_provider(url)` function** — returns `"openai"`, `"anthropic"`,
      or `"openrouter"` based on URL pattern. Falls back to `"openai"` for
      OpenAI-compatible endpoints (vLLM, etc.)
- [x] **Add per-provider builder functions:**
  - `_build_openai(model_config, **kwargs)` — existing logic, extracted
  - `_build_anthropic(model_config, **kwargs)` — `ChatAnthropic` with
    `max_completion_tokens` -> `max_tokens` mapping
  - `_build_openrouter(model_config, **kwargs)` — `ChatOpenRouter` with
    `extraBody.provider` -> `openrouter_provider`,
    `extraBody.reasoning` -> `reasoning` mapping
- [x] **Lazy imports** — import each class only inside its builder function,
      with clear `ImportError` message
- [x] **Update `from_model()`** — routes to correct builder via `_BUILDERS` dict
- [x] **Per-provider API key defaults (Python):**
  - `_PROVIDER_DEFAULT_KEY_ENV` dict: openai/anthropic/openrouter -> env var

## Phase 10.5.2: URL-Based API Key Inference (TypeScript)

- [x] **Added `inferDefaultApiKeyEnv(url)` in `openaiFactory.ts`** — infers
      default API key env var from model URL (`anthropic.com` -> `ANTHROPIC_API_KEY`,
      `openrouter.ai` -> `OPENROUTER_API_KEY`, fallback -> `OPENAI_API_KEY`)
- [x] **Updated API key resolution chain** — `apiKeyEnv` -> `inferDefaultApiKeyEnv(url)`
      -> `config.apiKey` -> empty string. No more hardcoded `OPENAI_API_KEY` fallback.
- [x] **Added `apiKeyEnv: "ANTHROPIC_API_KEY"` to Claude models in
      `models.default.json`** — belt-and-suspenders with the URL inference

## Phase 10.5.3: Testing

- [x] **Test OpenAI** — `gpt-4o-mini` invoke + stream: `ChatOpenAI` type confirmed
- [x] **Test Anthropic** — `claude-haiku-4-5-20251001` invoke + stream: `ChatAnthropic` type confirmed
- [x] **Test OpenRouter** — `deepseek/deepseek-v3.2` invoke + stream: `ChatOpenRouter` type confirmed
- [x] **Fixed `extra_body` issue** — `ChatOpenRouter` doesn't support `extra_body`;
      mapped to native `openrouter_provider` and `reasoning` fields instead
- [x] **TypeScript CLI tested** — Anthropic model now uses correct API key after rebuild

## Phase 10.5.4: Updates

- [x] **`list_models()` output** — added Provider column
- [x] **Updated phase10.5-todo.md**
