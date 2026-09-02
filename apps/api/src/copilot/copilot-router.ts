import { Router, type Request, type Response } from "express";
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";

import { getAiConfig, getLanguageModel } from "./provider.js";
import { SCHEMA_DOCUMENT } from "./schema-document.js";
import { sellerContext } from "../middleware/seller-context.js";
import { createCopilotTools } from "./tools/index.js";

export const copilotRouter = Router();

/**
 * How many tool-call steps the copilot may take before answering.
 *
 * The core loop: model writes SQL → queryDatabase runs it → if it errors, the
 * Postgres error is fed back → the model corrects the SQL and retries. Without
 * this, one bad guess fails the whole answer. isStepCount(3) bounds the loop so
 * a confused model cannot burn the whole request budget retrying.
 */
const MAX_TOOL_STEPS = 8;

const SYSTEM_PROMPT = `You are the PakCommerce AI Business Copilot running on the central Express backend.
You assist Pakistani ecommerce sellers with sales insights, stock levels, and Cash-on-Delivery (COD) risks.
Always ground answers in real business facts and use PKR (Rs.) for currency.

CONCISENESS & FORMATTING RULES:
- Keep answers concise, direct, and executive-ready. Avoid conversational filler, preambles, or excessive apologies.
- Provide answers in 1-3 short, clean paragraphs or bullet points.
- When listing multiple products, variants, stock counts, or prices, format them as clean GitHub-flavored Markdown tables (e.g., | Variant | SKU | Stock | Status |).
- Use Markdown bolding (**text**) for key metrics, SKUs, and statuses.

The database schema you can query:

${SCHEMA_DOCUMENT}

Tool discipline:
- searchProducts: the FIRST choice for any question about the seller's product catalogue (what exists, stock state, prices, composition). It returns structured data - summarise it honestly.
- getSchema: call before queryDatabase whenever you are not certain a table or column exists. It lists the real columns.
- queryDatabase: LAST RESORT, for a question no structured tool covers. Write a single read-only SELECT using the schema above. CRITICAL: NEVER include a semicolon (;) anywhere in the SQL query — semicolons are strictly rejected by the security sandbox. If the tool returns an error, read the database error carefully and correct the SQL, then try again.
- mutateDatabase: Universal write-side tool. Call this tool whenever the seller wants to make ANY database modification: updating product titles, descriptions, prices, stock levels, tags, status, or inserting/deleting variants or products. Provide a concise English summary and a single valid UPDATE/INSERT/DELETE statement.
- updateProductStock: specific stock adjustment tool.
- updateProductPrice: specific price adjustment tool.
- updateProductDetails: specific product title/metadata tool.
Do NOT ask for verbal confirmation in text first for any of these write actions — the frontend automatically pauses execution and renders an interactive "Approve & Execute" / "Deny" card for the seller to confirm before committing.

Rules:
- Never invent numbers - if the tools return rows, report them; if a tool errors, say what went wrong and fix the query rather than guessing.
- Never claim data exists that the tools did not return.
- Do not ask the seller for workspace or seller ids; the tools are already scoped to their data.`;

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
      `• **DeepSeek:** Set \`AI_PROVIDER=deepseek\` and \`DEEPSEEK_API_KEY\`\n` +
      `• **OpenRouter:** Set \`AI_PROVIDER=openrouter\` and \`OPENROUTER_API_KEY\`\n` +
      `• **Ollama (Free/Local):** Set \`AI_PROVIDER=ollama\` and run \`ollama run qwen2.5:7b\`\n\n` +
      `*Available Modular Tools:*\n` +
      `• \`searchProducts\` (Structured product catalogue search)\n` +
      `• \`getSchema\` (Database schema introspection)\n` +
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
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools: createCopilotTools(auth),
      toolApproval: {
        mutateDatabase: "user-approval",
        updateProductStock: "user-approval",
        updateProductPrice: "user-approval",
        updateProductDetails: "user-approval",
      },
      // Multi-step tool calling: let the model fix its own SQL after a failed
      // queryDatabase call, bounded so a looping model cannot run away.
      stopWhen: isStepCount(MAX_TOOL_STEPS),
    });

    await result.pipeUIMessageStreamToResponse(res);
  } catch (error) {
    console.error("Copilot stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process Copilot chat request" });
    }
  }
});
