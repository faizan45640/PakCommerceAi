import { Router, type Request, type Response } from "express";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";

import { getAiConfig, getLanguageModel } from "../lib/ai/provider.js";
import { sellerContext } from "../products/seller-context.js";
import { createCopilotTools } from "../tools/index.js";

export const copilotRouter = Router();

copilotRouter.post("/chat", async (req: Request, res: Response) => {
  const messages: UIMessage[] = req.body?.messages ?? [];
  const aiConfig = getAiConfig();

  // Fallback mock stream if the selected provider is not configured.
  // Requires auth like the real path - the route is mounted behind requireAuth.
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
      `• \`searchProducts\` (Structured product catalogue search)\n` +
      `• \`queryDatabase\` (Safe read-only SQL for questions no tool covers)\n` +
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
    // The route sits behind requireAuth, so req.auth is verified. Build a
    // request-scoped seller context and hand it to the tool factory - every
    // read tool queries as this seller, RLS scoped, no seller filters in code.
    const auth = sellerContext(req);
    const model = getLanguageModel();
    const result = streamText({
      model,
      system: `You are the PakCommerce AI Business Copilot running on the central Express backend.
You assist Pakistani ecommerce sellers with sales insights, stock levels, and Cash-on-Delivery (COD) risks.
Always ground answers in real business facts and use PKR (Rs.) for currency.

Use the tools you have instead of guessing:
- searchProducts: any question about the seller's product catalogue (what exists, stock state, prices, composition). It returns structured data - summarise it honestly.
- queryDatabase: a question no other tool covers. Write a single read-only SELECT against the seller's own tables and let the database answer. Never invent numbers - if the tool returns rows, report them; if it errors, say what went wrong.
Never claim data exists that the tools did not return.`,
      messages: await convertToModelMessages(messages),
      tools: createCopilotTools(auth),
    });

    await result.pipeUIMessageStreamToResponse(res);
  } catch (error) {
    console.error("Copilot stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process Copilot chat request" });
    }
  }
});
