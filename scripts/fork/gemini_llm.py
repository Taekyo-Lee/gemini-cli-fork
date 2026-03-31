"""
Lightweight LLM helper for gemini-cli-fork.

Reads models.default.json and returns a configured langchain_openai.ChatOpenAI
instance. No a2g_models dependency — just `pip install langchain-openai`.

Usage:
    from gemini_llm import from_model, list_models

    # Show available models for your environment
    list_models()

    # Get a configured ChatOpenAI and use it
    llm = from_model("GLM-5-Thinking")
    response = llm.invoke("Hello, how are you?")
    print(response.content)

    # With custom parameters
    llm = from_model("gpt-oss-120b", temperature=0.7, max_completion_tokens=4096)

    # Streaming
    for chunk in from_model("Kimi-K2.5-Thinking").stream("Explain Python GIL"):
        print(chunk.content, end="", flush=True)

Environment detection:
    Set A2G_LOCATION env var to: COMPANY/CORP, DEV/DEVELOPMENT, or HOME.
    Falls back to HOME if unset.

Models JSON path resolution (in order):
    1. GEMINI_CLI_MODELS_JSON env var
    2. Walk up from this script to find models.default.json at repo root
"""

from __future__ import annotations

import json
import os
import socket
from pathlib import Path
from typing import Any


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
    """Find models.default.json by walking up from this script or via env var."""
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
        candidate = directory / "models.default.json"
        if candidate.is_file():
            return candidate
        parent = directory.parent
        if parent == directory:
            break
        directory = parent

    raise FileNotFoundError(
        "models.default.json not found. Either:\n"
        "  - Run from within the gemini-cli-fork repo, or\n"
        "  - Set GEMINI_CLI_MODELS_JSON=/path/to/models.default.json"
    )


def _load_models() -> list[dict[str, Any]]:
    """Load and return all models from models.default.json."""
    path = _find_models_json()
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    models = data.get("models", [])
    if not isinstance(models, list):
        raise ValueError(f"Expected 'models' array in {path}")
    return models


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
# API key resolution
# ---------------------------------------------------------------------------

def _resolve_api_key(model_config: dict[str, Any]) -> str:
    """Resolve API key from model config's apiKeyEnv field, with fallbacks.

    Resolution order:
      1. model_config["apiKeyEnv"] env var (e.g., OPENROUTER_API_KEY)
      2. OPENAI_API_KEY env var
      3. Empty string (some corp endpoints don't need a key)
    """
    api_key_env = model_config.get("apiKeyEnv")
    if api_key_env:
        key = os.environ.get(api_key_env)
        if key:
            return key

    return os.environ.get("OPENAI_API_KEY", "")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

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
    available = [m for m in all_models if m.get(env, False)]

    # Print formatted table
    if not available:
        print(f"No models available for environment '{env}'.")
        print("Check A2G_LOCATION env var and models.default.json.")
        return available

    # Calculate column widths
    name_width = max(len(m["model"]) for m in available)
    url_width = max(len(m.get("url", "")) for m in available)
    name_width = max(name_width, 5)  # minimum "Model" header
    url_width = min(max(url_width, 3), 50)  # cap URL column

    print(f"\n  Available models [{env.upper()}]")
    print(f"  {'─' * (name_width + url_width + 20)}")
    print(f"  {'#':<4} {'Model':<{name_width}}  {'Context':>9}  {'URL':<{url_width}}")
    print(f"  {'─' * (name_width + url_width + 20)}")

    for i, m in enumerate(available, 1):
        ctx = f"{m.get('contextLength', 0) // 1000}k"
        url = m.get("url", "")
        if len(url) > url_width:
            url = url[:url_width - 3] + "..."
        print(f"  {i:<4} {m['model']:<{name_width}}  {ctx:>9}  {url:<{url_width}}")

    print(f"  {'─' * (name_width + url_width + 20)}\n")
    return available


def from_model(model_name: str, **kwargs: Any) -> "langchain_openai.ChatOpenAI":
    """Create a configured ChatOpenAI instance from a model name.

    Looks up the model in models.default.json, resolves API key, base URL,
    model alias, extra_body, and default_headers automatically.

    Args:
        model_name: Model name as it appears in models.default.json
                    (e.g., "GLM-5-Thinking", "gpt-oss-120b", "dev-DeepSeek-V3.2")
        **kwargs: Additional arguments passed to ChatOpenAI
                  (e.g., temperature, max_completion_tokens, streaming)

    Returns:
        A configured langchain_openai.ChatOpenAI instance ready for use.

    Raises:
        ImportError: If langchain-openai is not installed.
        ValueError: If model_name is not found in the registry.

    Examples:
        >>> llm = from_model("GLM-5-Thinking")
        >>> llm.invoke("Hello")

        >>> llm = from_model("gpt-oss-120b", temperature=0.7)
        >>> llm.stream("Explain transformers")

        >>> llm = from_model("dev-DeepSeek-V3.2", max_completion_tokens=4096)
    """
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:
        raise ImportError(
            "langchain-openai is required. Install it with:\n"
            "  pip install langchain-openai"
        ) from None

    # Find model in registry
    all_models = _load_models()
    model_config = next((m for m in all_models if m["model"] == model_name), None)

    if model_config is None:
        env = detect_environment()
        available = [m["model"] for m in all_models if m.get(env, False)]
        raise ValueError(
            f"Model '{model_name}' not found in models.default.json.\n"
            f"Available models for '{env}': {', '.join(available)}"
        )

    # Build ChatOpenAI arguments
    chat_kwargs: dict[str, Any] = {}

    # Model: use alias if provided (e.g., "deepseek/deepseek-v3.2")
    chat_kwargs["model"] = model_config.get("modelAlias") or model_config["model"]

    # Base URL
    chat_kwargs["base_url"] = model_config["url"]

    # API key
    api_key = kwargs.pop("api_key", None) or _resolve_api_key(model_config)
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

    # User kwargs override everything
    chat_kwargs.update(kwargs)

    return ChatOpenAI(**chat_kwargs)
