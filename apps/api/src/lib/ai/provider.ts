import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

export type AiProviderName = "google" | "openrouter" | "ollama" | "deepseek";

export interface AiConfig {
  provider: AiProviderName;
  model: string;
  isConfigured: boolean;
  missingConfigReason?: string;
}

export function getAiConfig(): AiConfig {
  const provider = (process.env.AI_PROVIDER?.toLowerCase() as AiProviderName) || "google";

  switch (provider) {
    case "ollama": {
      const model = process.env.AI_MODEL || "qwen2.5:7b";
      return {
        provider: "ollama",
        model,
        isConfigured: true, // Ollama connects to local daemon
      };
    }
    case "openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY;
      const model = process.env.AI_MODEL || "deepseek/deepseek-chat";
      return {
        provider: "openrouter",
        model,
        isConfigured: Boolean(apiKey && apiKey.trim().length > 0),
        missingConfigReason: "Missing OPENROUTER_API_KEY in environment variables.",
      };
    }
    case "deepseek": {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      const model = process.env.AI_MODEL || "deepseek-chat";
      return {
        provider: "deepseek",
        model,
        isConfigured: Boolean(apiKey && apiKey.trim().length > 0),
        missingConfigReason: "Missing DEEPSEEK_API_KEY in environment variables.",
      };
    }
    case "google":
    default: {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      const model = process.env.AI_MODEL || "gemini-1.5-flash";
      return {
        provider: "google",
        model,
        isConfigured: Boolean(apiKey && apiKey.trim().length > 0),
        missingConfigReason: "Missing GOOGLE_GENERATIVE_AI_API_KEY in environment variables.",
      };
    }
  }
}

/**
 * Returns the active Vercel AI SDK LanguageModel based on environment configuration.
 */
export function getLanguageModel(): LanguageModel {
  const config = getAiConfig();

  switch (config.provider) {
    case "ollama": {
      const baseURL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/api";
      const ollama = createOllama({ baseURL });
      return ollama(config.model) as unknown as LanguageModel;
    }
    case "openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("Cannot instantiate OpenRouter model: OPENROUTER_API_KEY is not set.");
      }
      const openrouter = createOpenRouter({ apiKey });
      return openrouter(config.model);
    }
    case "deepseek": {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error("Cannot instantiate DeepSeek model: DEEPSEEK_API_KEY is not set.");
      }
      // DeepSeek serves an OpenAI-compatible API, so it plugs in through the
      // generic OpenAI-compatible provider rather than a DeepSeek-specific SDK.
      const deepseek = createOpenAICompatible({
        name: "deepseek",
        baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
        apiKey,
      });
      return deepseek(config.model);
    }
    case "google":
    default: {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        throw new Error("Cannot instantiate Google Gemini model: GOOGLE_GENERATIVE_AI_API_KEY is not set.");
      }
      return google(config.model);
    }
  }
}
