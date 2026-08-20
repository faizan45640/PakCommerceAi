import { Router, type Request, type Response } from "express";
import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";
import { z } from "zod";

export const copilotRouter = Router();

copilotRouter.post("/chat", async (req: Request, res: Response) => {
  const messages: UIMessage[] = req.body?.messages ?? [];

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // Fallback mock stream if no API key is set in local environment
  if (!apiKey) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("X-Vercel-AI-Data-Stream", "v1");

    const sampleText =
      "🤖 **PakCommerce AI Business Copilot (Express Backend Active)**\n\n" +
      "The Copilot route in `apps/api` on port 4000 is running and connected!\n\n" +
      "To enable live Gemini streaming, add `GOOGLE_GENERATIVE_AI_API_KEY` to `.env`.\n\n" +
      "*Available Backend Tools:* `checkLowStock`, `getCourierPerformance`.";

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
    const result = streamText({
      model: google("gemini-1.5-flash"),
      system: `You are the PakCommerce AI Business Copilot running on the central Express backend.
You assist Pakistani ecommerce sellers with sales insights, stock levels, and Cash-on-Delivery (COD) risks.
Always ground answers in real business facts and use PKR (Rs.) for currency.`,
      messages: await convertToModelMessages(messages),
      tools: {
        checkLowStock: {
          description: "Fetch product variants that are low on stock",
          inputSchema: z.object({
            threshold: z.number().optional().default(5),
          }),
          execute: async ({ threshold }: { threshold: number }) => {
            return {
              status: "success",
              threshold,
              lowStockItems: [
                { title: "Embroidered Lawn Kurti (Medium)", stock: 2, status: "low_stock" },
                { title: "Leather Casual Loafers (Size 42)", stock: 1, status: "low_stock" },
              ],
            };
          },
        },
        getCourierPerformance: {
          description: "Get route success rates for couriers in a Pakistani city",
          inputSchema: z.object({
            city: z.string().describe("City name like Multan, Faisalabad, Karachi"),
          }),
          execute: async ({ city }: { city: string }) => {
            return {
              city,
              recommendedCourier: "PostEx",
              routeSuccessRate: "91%",
              alternativeCourier: "Trax",
              alternativeSuccessRate: "76%",
            };
          },
        },
      },
    });

    await result.pipeUIMessageStreamToResponse(res);
  } catch (error) {
    console.error("Copilot stream error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process Copilot chat request" });
    }
  }
});
