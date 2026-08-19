import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // Fallback mock stream if no API key is configured yet in local environment
  if (!apiKey) {
    const encoder = new TextEncoder();
    const customStream = new ReadableStream({
      start(controller) {
        const sampleText =
          "🤖 **PakCommerce AI Business Copilot (Scaffold Active)**\n\n" +
          "The Vercel AI SDK scaffold is successfully set up and connected!\n\n" +
          "To enable live model streaming with tool execution, please add your `GOOGLE_GENERATIVE_AI_API_KEY` to `apps/web/.env.local`.\n\n" +
          "*Planned Tools Available:* `checkLowStock`, `getCourierPerformance`, `calculateOrderRisk`.";

        // Stream tokens in small chunks
        const chunks = sampleText.split(" ");
        let i = 0;
        const interval = setInterval(() => {
          if (i < chunks.length) {
            const chunk = (i === 0 ? "" : " ") + chunks[i];
            controller.enqueue(
              encoder.encode(`0:${JSON.stringify(chunk)}\n`)
            );
            i++;
          } else {
            clearInterval(interval);
            controller.close();
          }
        }, 30);
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
      },
    });
  }

  // Live streaming using Google Gemini with workspace tools
  const result = streamText({
    model: google("gemini-1.5-flash"),
    system: `You are the PakCommerce AI Business Copilot.
You assist Pakistani ecommerce merchants with sales metrics, inventory stock levels, and Cash-on-Delivery (COD) logistics risks.
Always ground answers in real business facts and use PKR (Rs.) for currency.`,
    messages: await convertToModelMessages(messages),
    tools: {
      checkLowStock: {
        description: "Fetch variants that are currently low on inventory",
        inputSchema: z.object({
          threshold: z.number().optional().default(5).describe("Stock quantity threshold"),
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
        description: "Get delivery success rate of couriers for a specific Pakistani city",
        inputSchema: z.object({
          city: z.string().describe("Target city (e.g. Lahore, Karachi, Multan, Faisalabad)"),
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

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
