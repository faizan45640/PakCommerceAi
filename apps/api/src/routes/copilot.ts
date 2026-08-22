import { Router, type Request, type Response } from "express";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";

import { getAiConfig, getLanguageModel } from "../lib/ai/provider.js";
import { copilotTools } from "../tools/index.js";

export const copilotRouter = Router();

copilotRouter.post("/chat", async (req: Request, res: Response) => {
  const messages: UIMessage[] = req.body?.messages ?? [];
  const aiConfig = getAiConfig();

  // Fallback mock stream if the selected provider is not configured
  if (!aiConfig.isConfigured) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("X-Vercel-AI-Data-Stream", "v1");

    const sampleText =
      `🤖 **PakCommerce AI Business Copilot (Express Backend Active)**\n\n` +
      `Current AI Provider: \`${aiConfig.provider}\` (Model: \`${aiConfig.model}\`)\n\n` +
      `${aiConfig.missingConfigReason ?? "Provider not configured."}\n\n` +
      `*Supported Providers (configure in \`.env\`):*\n` +
      `• **Google Gemini:** Set \`AI_PROVIDER=google\` and \`GOOGLE_GENERATIVE_AI_API_KEY\`\n` +
      `• **OpenRouter:** Set \`AI_PROVIDER=openrouter\` and \`OPENROUTER_API_KEY\`\n` +
      `• **Ollama (Free/Local):** Set \`AI_PROVIDER=ollama\` and run \`ollama run qwen2.5:7b\`\n\n` +
      `*Available Modular Tools:*\n` +
      `• \`queryDatabase\` (Safe Read-Only SQL & Analytics)\n` +
      `• \`getCourierPerformance\` (City delivery metrics)\n` +
      `• \`updateProductStock\` (Guarded mutation with confirmation)`;

    const chunks = sampleText.split(" ");
    let i = 0;

    const interval = setInterval(() => {
      if (i < chunks.length) {
        const chunk = (i === 0 ? "" : " ") + chunks[i];
        res.write(`0:${JSON.stringify(chunk)}\n`);
        i++;
      } else {
        clearInterval(interval);
        res.end();
      }
    }, 25);

    return;
  }

  try {
    const model = getLanguageModel();
    const result = streamText({
      model,
      system: `You are the PakCommerce AI Business Copilot running on the central Express backend.
You assist Pakistani ecommerce sellers with sales insights, stock levels, and Cash-on-Delivery (COD) risks.
Always ground answers in real business facts and use PKR (Rs.) for currency.`,
      messages: await convertToModelMessages(messages),
      tools: copilotTools,
    });

    await result.pipeUIMessageStreamToResponse(res);
  } catch (error) {
    console.error("Copilot stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process Copilot chat request" });
    }
  }
});

