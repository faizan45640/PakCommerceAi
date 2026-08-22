import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAiConfig, getLanguageModel } from "./provider.js";

describe("AI Provider Factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to Google Gemini provider with gemini-1.5-flash", () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    const config = getAiConfig();
    expect(config.provider).toBe("google");
    expect(config.model).toBe("gemini-1.5-flash");
    expect(config.isConfigured).toBe(false);
    expect(config.missingConfigReason).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("marks Google as configured when GOOGLE_GENERATIVE_AI_API_KEY is present", () => {
    process.env.AI_PROVIDER = "google";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "mock-google-key";

    const config = getAiConfig();
    expect(config.isConfigured).toBe(true);

    const model = getLanguageModel() as { modelId?: string };
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gemini-1.5-flash");
  });

  it("configures OpenRouter provider when AI_PROVIDER=openrouter", () => {
    process.env.AI_PROVIDER = "openrouter";
    delete process.env.OPENROUTER_API_KEY;

    const unconfigured = getAiConfig();
    expect(unconfigured.provider).toBe("openrouter");
    expect(unconfigured.model).toBe("deepseek/deepseek-chat");
    expect(unconfigured.isConfigured).toBe(false);
    expect(unconfigured.missingConfigReason).toContain("OPENROUTER_API_KEY");

    process.env.OPENROUTER_API_KEY = "mock-openrouter-key";
    process.env.AI_MODEL = "meta-llama/llama-3.3-70b-instruct";

    const configured = getAiConfig();
    expect(configured.isConfigured).toBe(true);
    expect(configured.model).toBe("meta-llama/llama-3.3-70b-instruct");

    const model = getLanguageModel() as { modelId?: string };
    expect(model).toBeDefined();
    expect(model.modelId).toBe("meta-llama/llama-3.3-70b-instruct");
  });

  it("configures local Ollama provider when AI_PROVIDER=ollama", () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.AI_MODEL = "qwen2.5:7b";

    const config = getAiConfig();
    expect(config.provider).toBe("ollama");
    expect(config.model).toBe("qwen2.5:7b");
    expect(config.isConfigured).toBe(true);

    const model = getLanguageModel() as { modelId?: string };
    expect(model).toBeDefined();
    expect(model.modelId).toBe("qwen2.5:7b");
  });
});
