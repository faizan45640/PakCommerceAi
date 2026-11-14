import { z } from "zod";

import type { CustomerContextFound } from "@pakcommerce/shared";

import { getCustomerContext } from "../../../customers/customer-service.js";
import type { SellerContext } from "../../../middleware/seller-context.js";
import { getCurrentWorkspace } from "../../../workspaces/workspace-service.js";

/**
 * Read-Side AI Tool: a compact profile of one customer.
 *
 * Calls the same `getCustomerContext` the WhatsApp Sales Agent reaches over
 * `GET /customers/context`, so both get one shape. The workspace is the
 * seller's current one (as `GET /workspaces/current`); the model never supplies
 * it, and RLS scopes the rows. An unknown customer is a normal answer
 * (`found: false`). Failures (bad input, database errors) are a distinct
 * `{ status: "error" }` so a transient error is never read as a new customer.
 */

export const getCustomerProfileInputSchema = z
  .object({
    customerId: z.uuid().optional().describe("The customer's id, if you already have it"),
    phone: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .optional()
      .describe("The customer's phone in any format, e.g. 0300-1234567 or +92 300 1234567"),
  })
  .refine((value) => (value.customerId === undefined) !== (value.phone === undefined), {
    message: "Provide exactly one of customerId or phone.",
  });

export type GetCustomerProfileInput = z.input<typeof getCustomerProfileInputSchema>;

export type GetCustomerProfileResult =
  | CustomerContextFound
  | { found: false; message: string }
  | { status: "error"; message: string };

export function getCustomerProfileTool(auth: SellerContext) {
  return {
    description:
      "Look up one customer by phone number or customer id and return a compact profile: name, city, tags (first_time, repeat, has_returns, flagged), lifetime spend, order counts, returned orders, last 5 orders and risk notes. Use it for questions about a specific customer, whether someone is a repeat customer, whether they have returned orders, and before creating a draft order for a phone number. Provide exactly one of customerId or phone. found: false (with no error) means this is a new customer; a status error is a failed lookup, not a new customer.",
    inputSchema: getCustomerProfileInputSchema,
    execute: async (input: GetCustomerProfileInput): Promise<GetCustomerProfileResult> => {
      const parsed = getCustomerProfileInputSchema.safeParse(input);
      if (!parsed.success) {
        return { status: "error", message: "Provide exactly one of customerId or phone." };
      }

      try {
        const workspace = await getCurrentWorkspace(auth);
        const { customerId, phone } = parsed.data;
        const context = await getCustomerContext(
          auth,
          workspace.id,
          customerId ? { customerId } : { phone: phone as string },
        );

        if (!context.found) {
          return { found: false, message: "No customer found. This looks like a new customer." };
        }
        return context;
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : "Could not look up the customer.",
        };
      }
    },
  };
}
