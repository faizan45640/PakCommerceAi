"""Chat model factory. Same env names as the Node copilot (apps/api/src/copilot/provider.ts).

Switching vendor is env-only: set AI_PROVIDER (and AI_MODEL / the vendor key).
"""

from __future__ import annotations

import os
from collections.abc import Mapping

from langchain_core.language_models.chat_models import BaseChatModel

PROVIDERS = ("deepseek", "google", "openrouter", "ollama")
DEFAULT_PROVIDER = "deepseek"
DEFAULT_MODELS = {
    "deepseek": "deepseek-chat",
    "google": "gemini-2.5-flash",
    "openrouter": "deepseek/deepseek-chat",
    "ollama": "qwen2.5:7b",
}
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
OLLAMA_BASE_URL = "http://localhost:11434"


class LLMConfigError(RuntimeError):
    """Provider is unknown or its credentials are missing."""


def _require(env: Mapping[str, str], key: str) -> str:
    value = (env.get(key) or "").strip()
    if not value:
        raise LLMConfigError(f"Missing {key} in environment variables.")
    return value


def get_chat_model(
    env: Mapping[str, str] | None = None, *, temperature: float = 0.2
) -> BaseChatModel:
    env = os.environ if env is None else env
    provider = (env.get("AI_PROVIDER") or DEFAULT_PROVIDER).strip().lower()
    if provider not in PROVIDERS:
        raise LLMConfigError(
            f"Unknown AI_PROVIDER '{provider}'. Use one of: {', '.join(PROVIDERS)}."
        )
    model = (env.get("AI_MODEL") or "").strip() or DEFAULT_MODELS[provider]

    if provider == "deepseek":
        from langchain_deepseek import ChatDeepSeek

        return ChatDeepSeek(
            model=model,
            api_key=_require(env, "DEEPSEEK_API_KEY"),
            api_base=(env.get("DEEPSEEK_BASE_URL") or "").strip() or DEEPSEEK_BASE_URL,
            temperature=temperature,
        )
    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=_require(env, "GOOGLE_GENERATIVE_AI_API_KEY"),
            temperature=temperature,
        )
    if provider == "openrouter":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model,
            api_key=_require(env, "OPENROUTER_API_KEY"),
            base_url=OPENROUTER_BASE_URL,
            temperature=temperature,
        )
    from langchain_ollama import ChatOllama

    # Node's OLLAMA_BASE_URL ends in /api; the Python client wants the bare host.
    base = (env.get("OLLAMA_BASE_URL") or "").strip() or OLLAMA_BASE_URL
    base = base.rstrip("/").removesuffix("/api")
    return ChatOllama(model=model, base_url=base, temperature=temperature)
