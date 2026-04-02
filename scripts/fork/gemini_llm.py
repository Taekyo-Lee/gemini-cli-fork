"""
Lightweight LLM helper for gemini-cli-fork.

Reads config/models.default.json and returns a configured LangChain chat model instance.
Routes to the native LangChain class for each provider:

  - OpenAI (api.openai.com)     -> ChatOpenAI       (pip install langchain-openai)
  - Anthropic (api.anthropic.com) -> ChatAnthropic   (pip install langchain-anthropic)
  - OpenRouter (openrouter.ai)  -> ChatOpenRouter    (pip install langchain-openrouter)

No a2g_models dependency — just install the provider package(s) you need.

All LangChain constructor parameters are supported directly in config/models.default.json.
Any key that isn't a registry key (model, url, contextLength, etc.) is passed
through as a constructor kwarg to the LangChain class. For example:

    {
      "model": "[Anthropic] claude-opus-4-6",
      "modelAlias": "claude-opus-4-6",
      "url": "https://api.anthropic.com/v1",
      "contextLength": 1000000,
      "maxTokens": 128000,
      "thinking": {"type": "enabled", "budget_tokens": 10000},
      "temperature": 0.7
    }

Usage:
    from gemini_llm import from_model, list_models

    # Show available models for your environment
    list_models()

    # Get a configured chat model and use it
    llm = from_model("[On-Prem] GLM-5-Thinking")
    response = llm.invoke("Hello, how are you?")
    print(response.content)

    # With custom parameters (override JSON defaults)
    llm = from_model("[OpenAI] gpt-5", temperature=0.7, max_completion_tokens=4096)

    # Streaming
    for chunk in from_model("[Anthropic] claude-opus-4-6").stream("Explain Python GIL"):
        print(chunk.content, end="", flush=True)

Environment detection:
    Set A2G_LOCATION env var to: COMPANY/CORP, DEV/DEVELOPMENT, or HOME.
    Falls back to HOME if unset.

Models JSON path resolution (in order):
    1. GEMINI_CLI_MODELS_JSON env var
    2. Walk up from this script to find config/models.default.json at repo root
"""

from __future__ import annotations

import json
import os
import socket
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Registry-only keys (consumed by our code, NOT passed to LangChain)
# ---------------------------------------------------------------------------

_REGISTRY_KEYS = frozenset({
    "model", "modelAlias", "url", "modality",
    "apiKeyEnv", "contextLength", "maxTokens",
    "corp", "home", "dev",
    "supportsResponsesApi", "reasoningModel",
    "defaultHeaders", "extraBody",
    "_section", "_comment",
})


# ---------------------------------------------------------------------------
# Provider detection
# ---------------------------------------------------------------------------

def _detect_provider(url: str) -> str:
    """Detect provider from the model's API URL.

    Returns:
        "openai", "anthropic", "openrouter", or "openai" as fallback
        (OpenAI-compatible endpoints like vLLM use the OpenAI client).
    """
    url_lower = url.lower()
    if "anthropic.com" in url_lower:
        return "anthropic"
    if "openrouter.ai" in url_lower:
        return "openrouter"
    # OpenAI and any OpenAI-compatible endpoint (vLLM, etc.)
    return "openai"


# ---------------------------------------------------------------------------
# Environment detection (mirrors llmRegistry.ts detectLocation())
# ---------------------------------------------------------------------------

def detect_environment() -> str:
    """Detect current environment: 'corp', 'home', or 'dev'.

    Checks A2G_LOCATION env var first, then falls back to hostname heuristic.
    """
    env_location = os.environ.get("A2G_LOCATION", "").upper()

    if env_location in ("COMPANY", "PRODUCTION", "CORP"):
        return "corp"
    if env_location in ("DEVELOPMENT", "DEV"):
        return "dev"
    if env_location == "HOME":
        return "home"

    # Hostname fallback
    try:
        hostname = socket.gethostname().lower()
        if any(p in hostname for p in ("prod", "company", "server")):
            return "corp"
    except OSError:
        pass

    return "home"


# ---------------------------------------------------------------------------
# Models JSON loading
# ---------------------------------------------------------------------------

def _find_models_json() -> Path:
    """Find config/config/models.default.json by walking up from this script or via env var."""
    # 1. Env var override
    env_path = os.environ.get("GEMINI_CLI_MODELS_JSON")
    if env_path:
        p = Path(env_path)
        if p.is_file():
            return p
        raise FileNotFoundError(
            f"GEMINI_CLI_MODELS_JSON points to '{env_path}' but file not found."
        )

    # 2. Walk up from this script's directory
    directory = Path(__file__).resolve().parent
    for _ in range(8):
        candidate = directory / "config" / "config/models.default.json"
        if candidate.is_file():
            return candidate
        parent = directory.parent
        if parent == directory:
            break
        directory = parent

    raise FileNotFoundError(
        "config/config/models.default.json not found. Either:\n"
        "  - Run from within the gemini-cli-fork repo, or\n"
        "  - Set GEMINI_CLI_MODELS_JSON=/path/to/config/config/models.default.json"
    )


def _load_models() -> list[dict[str, Any]]:
    """Load and return all models from config/models.default.json."""
    path = _find_models_json()
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    models = data.get("models", [])
    if not isinstance(models, list):
        raise ValueError(f"Expected 'models' array in {path}")
    # Skip section separators (entries without "model" or "url")
    return [m for m in models if "model" in m and "url" in m]


def _extract_passthrough_kwargs(model_config: dict[str, Any]) -> dict[str, Any]:
    """Extract all non-registry keys from model config as LangChain kwargs.

    Any key in config/models.default.json that isn't in _REGISTRY_KEYS is treated as
    a LangChain constructor parameter and passed through directly.
    """
    return {k: v for k, v in model_config.items() if k not in _REGISTRY_KEYS}


# ---------------------------------------------------------------------------
# Corp auth header resolution (mirrors llmRegistry.ts buildCorpAuthHeaders())
# ---------------------------------------------------------------------------

def _build_corp_auth_headers() -> dict[str, str]:
    """Build corp auth headers from FALLBACK_API_KEY_1 and AD_ID env vars.

    FALLBACK_API_KEY_1 format: "<system_name>/<dep_ticket>"
    """
    fallback_key = os.environ.get("FALLBACK_API_KEY_1", "/")
    parts = fallback_key.split("/", 1)
    system_name = parts[0] if len(parts) > 0 else ""
    dep_ticket = parts[1] if len(parts) > 1 else ""

    return {
        "x-dep-ticket": dep_ticket,
        "Send-System-Name": system_name,
        "User-Id": os.environ.get("AD_ID", ""),
        "User-Type": "AD_ID",
    }


# ---------------------------------------------------------------------------
# API key resolution (per-provider defaults)
# ---------------------------------------------------------------------------

_PROVIDER_DEFAULT_KEY_ENV = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}


def _resolve_api_key(model_config: dict[str, Any], provider: str) -> str:
    """Resolve API key from model config's apiKeyEnv field, with fallbacks.

    Resolution order:
      1. model_config["apiKeyEnv"] env var (e.g., OPENROUTER_API_KEY)
      2. Provider default env var (OPENAI_API_KEY / ANTHROPIC_API_KEY / etc.)
      3. Empty string (some corp endpoints don't need a key)
    """
    api_key_env = model_config.get("apiKeyEnv")
    if api_key_env:
        key = os.environ.get(api_key_env)
        if key:
            return key

    default_env = _PROVIDER_DEFAULT_KEY_ENV.get(provider, "OPENAI_API_KEY")
    return os.environ.get(default_env, "")


# ---------------------------------------------------------------------------
# Per-provider builders
# ---------------------------------------------------------------------------

def _build_openai(
    model_config: dict[str, Any], api_key: str, passthrough: dict[str, Any], **kwargs: Any
) -> Any:
    """Build a ChatOpenAI instance."""
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        raise ImportError(
            "langchain-openai is required for OpenAI models. Install with:\n"
            "  pip install langchain-openai"
        ) from None

    chat_kwargs: dict[str, Any] = {}
    chat_kwargs["model"] = model_config.get("modelAlias") or model_config["model"]
    chat_kwargs["base_url"] = model_config["url"]
    if api_key:
        chat_kwargs["api_key"] = api_key

    # Default headers (resolve __corp_auth__ sentinel)
    raw_headers = model_config.get("defaultHeaders")
    if raw_headers == "__corp_auth__":
        chat_kwargs["default_headers"] = _build_corp_auth_headers()
    elif isinstance(raw_headers, dict):
        chat_kwargs["default_headers"] = raw_headers

    # Extra body (e.g., OpenRouter provider/reasoning config)
    extra_body = model_config.get("extraBody")
    if extra_body:
        chat_kwargs["extra_body"] = extra_body

    # Passthrough params from JSON, then user kwargs override
    chat_kwargs.update(passthrough)
    chat_kwargs.update(kwargs)
    return ChatOpenAI(**chat_kwargs)


def _build_anthropic(
    model_config: dict[str, Any], api_key: str, passthrough: dict[str, Any], **kwargs: Any
) -> Any:
    """Build a ChatAnthropic instance."""
    try:
        from langchain_anthropic import ChatAnthropic
    except ImportError:
        raise ImportError(
            "langchain-anthropic is required for Anthropic models. Install with:\n"
            "  pip install langchain-anthropic"
        ) from None

    chat_kwargs: dict[str, Any] = {}
    chat_kwargs["model"] = model_config.get("modelAlias") or model_config["model"]
    if api_key:
        chat_kwargs["api_key"] = api_key

    # Passthrough params from JSON, then user kwargs override
    chat_kwargs.update(passthrough)
    chat_kwargs.update(kwargs)

    # Map max_completion_tokens -> max_tokens for Anthropic
    if "max_completion_tokens" in chat_kwargs:
        chat_kwargs["max_tokens"] = chat_kwargs.pop("max_completion_tokens")

    return ChatAnthropic(**chat_kwargs)


def _build_openrouter(
    model_config: dict[str, Any], api_key: str, passthrough: dict[str, Any], **kwargs: Any
) -> Any:
    """Build a ChatOpenRouter instance."""
    try:
        from langchain_openrouter import ChatOpenRouter
    except ImportError:
        raise ImportError(
            "langchain-openrouter is required for OpenRouter models. Install with:\n"
            "  pip install langchain-openrouter"
        ) from None

    chat_kwargs: dict[str, Any] = {}
    chat_kwargs["model"] = model_config.get("modelAlias") or model_config["model"]
    if api_key:
        chat_kwargs["api_key"] = api_key

    # Map extraBody fields to ChatOpenRouter's native params
    extra_body = model_config.get("extraBody")
    if extra_body:
        if "provider" in extra_body:
            chat_kwargs["openrouter_provider"] = extra_body["provider"]
        if "reasoning" in extra_body:
            chat_kwargs["reasoning"] = extra_body["reasoning"]
        # Pass remaining keys via model_kwargs
        remaining = {k: v for k, v in extra_body.items()
                     if k not in ("provider", "reasoning")}
        if remaining:
            chat_kwargs["model_kwargs"] = remaining

    # Passthrough params from JSON (overrides extraBody mappings), then user kwargs
    chat_kwargs.update(passthrough)
    chat_kwargs.update(kwargs)
    return ChatOpenRouter(**chat_kwargs)


_BUILDERS = {
    "openai": _build_openai,
    "anthropic": _build_anthropic,
    "openrouter": _build_openrouter,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _is_model_available(model: dict[str, Any], env: str) -> bool:
    """Check if a model is available in the given environment.

    If the model has no corp/home/dev keys, it is available everywhere.
    """
    has_env_flags = "corp" in model or "home" in model or "dev" in model
    if not has_env_flags:
        return True
    return model.get(env, False)


def list_models(environment: str | None = None) -> list[dict[str, Any]]:
    """List available models for the current (or specified) environment.

    Args:
        environment: Override environment detection. One of 'corp', 'home', 'dev'.
                     If None, auto-detects from A2G_LOCATION env var.

    Returns:
        List of model config dicts available in the environment.
        Also prints a formatted table to stdout.
    """
    env = environment or detect_environment()
    all_models = _load_models()
    available = [
        m for m in all_models
        if _is_model_available(m, env)
    ]

    # Print formatted table
    if not available:
        print(f"No models available for environment '{env}'.")
        print("Check A2G_LOCATION env var and config/models.default.json.")
        return available

    # Calculate column widths
    name_width = max(len(m["model"]) for m in available)
    name_width = max(name_width, 5)

    print(f"\n  Available models [{env.upper()}]")
    print(f"  {'─' * (name_width + 40)}")
    print(f"  {'#':<4} {'Model':<{name_width}}  {'Provider':<12} {'Context':>9}")
    print(f"  {'─' * (name_width + 40)}")

    for i, m in enumerate(available, 1):
        ctx = f"{m.get('contextLength', 0) // 1000}k"
        provider = _detect_provider(m.get("url", ""))
        print(f"  {i:<4} {m['model']:<{name_width}}  {provider:<12} {ctx:>9}")

    print(f"  {'─' * (name_width + 40)}\n")
    return available


def from_model(model_name: str, **kwargs: Any) -> Any:
    """Create a configured LangChain chat model from a model name.

    Routes to the native LangChain class based on the model's API URL:
      - api.openai.com     -> ChatOpenAI       (pip install langchain-openai)
      - api.anthropic.com  -> ChatAnthropic     (pip install langchain-anthropic)
      - openrouter.ai      -> ChatOpenRouter    (pip install langchain-openrouter)
      - Other URLs         -> ChatOpenAI        (OpenAI-compatible fallback)

    All LangChain constructor parameters are supported in config/models.default.json.
    Any key that isn't a registry key is passed through to the constructor.
    User kwargs override JSON defaults.

    Args:
        model_name: Model name as it appears in config/models.default.json
        **kwargs: Additional arguments passed to the LangChain chat model.
                  These override any values set in config/models.default.json.

    Returns:
        A configured LangChain chat model instance ready for use.

    Raises:
        ImportError: If the required provider package is not installed.
        ValueError: If model_name is not found in the registry.

    Examples:
        >>> llm = from_model("[OpenAI] gpt-5")
        >>> llm.invoke("Hello")

        >>> # JSON has thinking config; override temperature at call time
        >>> llm = from_model("[Anthropic] claude-opus-4-6", temperature=0.5)

        >>> llm = from_model("[OpenRouter] deepseek-v3.2-Thinking")
        >>> for chunk in llm.stream("Write a poem"):
        ...     print(chunk.content, end="")
    """
    # Find model in registry
    all_models = _load_models()
    model_config = next((m for m in all_models if m["model"] == model_name), None)

    if model_config is None:
        env = detect_environment()
        available = [m["model"] for m in all_models if m.get(env, False)]
        raise ValueError(
            f"Model '{model_name}' not found in config/models.default.json.\n"
            f"Available models for '{env}': {', '.join(available)}"
        )

    # Detect provider and resolve API key
    provider = _detect_provider(model_config["url"])
    api_key = kwargs.pop("api_key", None) or _resolve_api_key(model_config, provider)

    # Extract passthrough kwargs from JSON (everything not a registry key)
    passthrough = _extract_passthrough_kwargs(model_config)

    # Route to provider-specific builder
    builder = _BUILDERS[provider]
    return builder(model_config, api_key, passthrough, **kwargs)
