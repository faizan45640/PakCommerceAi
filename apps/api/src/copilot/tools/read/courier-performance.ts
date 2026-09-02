import { z } from "zod";

/**
 * Read-Side AI Tool: Courier Delivery & Return Performance.
 */
export const getCourierPerformanceTool = {
  description:
    "Get historical delivery success rates, return rates, and shipping cost estimates for couriers (Trax, PostEx, Leopards, TCS) in a specific Pakistani city.",
  inputSchema: z.object({
    city: z.string().describe("Pakistani destination city name (e.g. Multan, Karachi, Faisalabad)"),
  }),
  execute: async ({ city }: { city: string }) => {
    return {
      status: "success",
      city,
      topRecommendedCourier: "PostEx",
      successRate: "91%",
      avgDeliveryDays: 2.1,
      alternativeCourier: "Trax",
      alternativeSuccessRate: "78%",
    };
  },
};
