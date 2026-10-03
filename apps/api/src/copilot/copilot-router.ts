import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import {
  convertToModelMessages,
  createIdGenerator,
  isStepCount,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
  TypeValidationError,
  validateUIMessages,
  type UIMessage,
} from "ai";

import { HttpError, NotFoundError, ValidationError } from "../lib/http-errors.js";
import { getAiConfig, getLanguageModel } from "./provider.js";
import { SCHEMA_DOCUMENT } from "./schema-document.js";
import { sellerContext } from "../middleware/seller-context.js";
import { createCopilotTools } from "./tools/index.js";
import {
  applyIncomingMessage,
  archiveChat,
  createChat,
  deleteChat,
  listChats,
  loadChat,
  saveChat,
  unarchiveChat,
} from "./chat-store.js";

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

// Seller-facing name is Rafiq. This module, the route, and the tools stay "copilot".
const SYSTEM_PROMPT = `You are Rafiq, the shop assistant inside PakCommerce AI.
You help a Pakistani online seller run their shop: products, stock, prices, and couriers.
They are a shop owner, not a developer. Speak the way you would to someone packing orders on WhatsApp.

HOW YOU SPEAK:
- Simple English. Short sentences. Warm and direct. No filler.
- Money is rupees: Rs. 2,500. Stock is pieces.
- Never mention SQL, databases, tables, columns, schemas, RLS, UUIDs, APIs, queries, or the names of your tools.
- Never paste a query or an error from the database. If something fails, say what you could not find in shop words and try another way.
- Answers are 1–3 short paragraphs, or a short list. When you list products, sizes, stock, or prices, use a clean Markdown table with headers a seller understands (Size, SKU, Pieces, Price, Status).
- Use **bold** for the number that matters: a price, a piece count, a product name.
- Status words for the seller: Live (active), Not listed yet (draft), Hidden (archived). In stock, low, and out of stock stay in plain words.

The database schema you can query:

${SCHEMA_DOCUMENT}

Tool discipline:
- searchProducts: the FIRST choice for any question about the seller's product catalogue (what exists, stock state, prices, composition). It returns structured data - summarise it honestly. Tool args use DB enums: statuses draft|active|archived (Live in speech = active), inventoryStates in_stock|low_stock|out_of_stock|untracked. Prefer statuses: ["active"] when the seller says live. It returns variantCount, not size names — for size/SKU breakdown use queryDatabase on product_variants.
- getSchema: call before queryDatabase whenever you are not certain a table or column exists. It lists the real columns.
- queryDatabase: LAST RESORT, for a question no structured tool covers. Write a single read-only SELECT using the schema above. CRITICAL: NEVER include a semicolon (;) anywhere in the SQL query — semicolons are strictly rejected by the security sandbox. If the tool returns an error, read the database error carefully and correct the SQL, then try again.
- mutateDatabase: Universal write-side tool. Call this tool whenever the seller wants to make ANY shop change: updating product titles, descriptions, prices, stock levels, tags, status, or inserting/deleting variants or products. The summary is shown to the seller word for word before they approve. Write one plain sentence, for example "Set Lawn Kurta, Medium, to 12 pieces." Never mention SQL in that sentence. The SQL itself goes only in the sql field.
- updateProductStock: specific stock adjustment tool.
- updateProductPrice: specific price adjustment tool.
- updateProductDetails: specific product title/metadata tool.
Do NOT ask for a yes in your own message. The screen pauses and shows "Yes, save it" and "No, leave it". Tell the seller what you found, then stop.

Rules:
- Never invent numbers. If the tools return rows, report them in shop words. If a tool errors, try a different tool. Tell the seller only what you could or could not find.
- Never claim data exists that the tools did not return.
- Do not ask the seller for workspace or seller ids; the tools are already scoped to their data.`;

const chatIdSchema = z.uuid();

const chatTurnSchema = z.object({
  id: chatIdSchema,
  message: z
    .object({
      id: z.string().min(1),
      role: z.enum(["user", "assistant", "system"]),
      parts: z.array(z.unknown()),
    })
    .passthrough(),
});

const assistantMessageId = createIdGenerator({ prefix: "msg", size: 16 });

function chatIdFrom(params: Request["params"]): string {
  const parsed = chatIdSchema.safeParse(params.id);
  if (!parsed.success) throw new ValidationError("Invalid chat.");
  return parsed.data;
}

copilotRouter.get("/chats", async (req, res, next) => {
  try {
    const archived = req.query.archived === "1" || req.query.archived === "true";
    res.json({ data: await listChats(sellerContext(req), { archived }) });
  } catch (error) {
    next(error);
  }
});

copilotRouter.post("/chats", async (req, res, next) => {
  try {
    res.status(201).json({ data: await createChat(sellerContext(req)) });
  } catch (error) {
    next(error);
  }
});

copilotRouter.get("/chats/:id", async (req, res, next) => {
  try {
    const id = chatIdFrom(req.params);
    res.json({ data: { id, messages: await loadChat(sellerContext(req), id) } });
  } catch (error) {
    next(error);
  }
});

copilotRouter.post("/chats/:id/archive", async (req, res, next) => {
  try {
    const id = chatIdFrom(req.params);
    res.json({ data: await archiveChat(sellerContext(req), id) });
  } catch (error) {
    next(error);
  }
});

copilotRouter.post("/chats/:id/unarchive", async (req, res, next) => {
  try {
    const id = chatIdFrom(req.params);
    res.json({ data: await unarchiveChat(sellerContext(req), id) });
  } catch (error) {
    next(error);
  }
});

copilotRouter.delete("/chats/:id", async (req, res, next) => {
  try {
    const id = chatIdFrom(req.params);
    await deleteChat(sellerContext(req), id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

copilotRouter.post("/chat", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = chatTurnSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new ValidationError("Invalid chat message."));
    return;
  }

  const { id, message } = parsed.data;
  const aiConfig = getAiConfig();

  // Fallback mock stream if the selected provider is not configured.
  // Requires auth like the real path - the route is mounted behind requireAuth.
  if (!aiConfig.isConfigured) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("X-Vercel-AI-Data-Stream", "v1");

    const sampleText =
      `**Rafiq is not connected yet.**\n\n` +
      `The shop assistant needs an AI key before it can look at your products. Ask whoever set up this workspace to add one.\n\n` +
      `*Copilot setup (\`.env\`):* provider \`${aiConfig.provider}\`, model \`${aiConfig.model}\`. ${aiConfig.missingConfigReason ?? "Provider not configured."}\n` +
      `• Google: \`AI_PROVIDER=google\` and \`GOOGLE_GENERATIVE_AI_API_KEY\`\n` +
      `• DeepSeek: \`AI_PROVIDER=deepseek\` and \`DEEPSEEK_API_KEY\`\n` +
      `• OpenRouter: \`AI_PROVIDER=openrouter\` and \`OPENROUTER_API_KEY\`\n` +
      `• Ollama: \`AI_PROVIDER=ollama\` and \`ollama run qwen2.5:7b\``;

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
    const tools = createCopilotTools(auth);
    const stored = await loadChat(auth, id);
    const messages = applyIncomingMessage(stored, message as UIMessage);

    let validated: UIMessage[];
    try {
      // Tools are typed for streamText. validateUIMessages wants a looser ToolSet.
      validated = await validateUIMessages({
        messages,
        tools: tools as Parameters<typeof validateUIMessages>[0]["tools"],
      });
    } catch (error) {
      if (!(error instanceof TypeValidationError)) throw error;
      // An old tool part no longer matches the current tools. Keep the new
      // turn rather than refusing the whole chat.
      console.error("Copilot history failed validation:", error);
      validated = await validateUIMessages({
        messages: [message],
        tools: tools as Parameters<typeof validateUIMessages>[0]["tools"],
      });
    }

    const model = getLanguageModel();
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(validated),
      tools,
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

    // Finish and save even if the seller closes the tab.
    void result.consumeStream();

    const stream = toUIMessageStream({
      stream: result.stream,
      originalMessages: validated,
      generateMessageId: assistantMessageId,
      onEnd: ({ messages: finished }) => {
        void saveChat(auth, id, finished).catch((error) => {
          console.error("Failed to save copilot chat:", error);
        });
      },
    });

    await pipeUIMessageStreamToResponse({ response: res, stream });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof HttpError) {
      next(error);
      return;
    }
    console.error("Copilot stream error:", error);
    if (!res.headersSent) {
      next(error);
    }
  }
});
