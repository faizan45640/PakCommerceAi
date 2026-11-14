import {
  createDraftOrderInputSchema,
  orderChannelSchema,
  orderPaymentMethodSchema,
} from "@pakcommerce/shared";
import { z } from "zod";

import { HttpError, NotFoundError, ValidationError } from "../../../lib/http-errors.js";
import type { SellerContext } from "../../../middleware/seller-context.js";
import { createDraftOrder } from "../../../orders/order-service.js";
import { getCurrentWorkspace } from "../../../workspaces/workspace-service.js";

/**
 * Deliberately narrow. There is no status, unit price, title, sku or total
 * here: the model describes WHO is buying WHAT, and the server decides the
 * status (always draft) and snapshots every price from the catalogue. Unknown
 * keys are stripped by zod, and `execute` builds the service input field by
 * field, so nothing extra can reach `createDraftOrder`.
 */
export const createDraftOrderToolInputSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1).max(160).describe("Customer's full name"),
    phone: z.string().trim().min(5).max(32).describe("Customer's phone number"),
    city: z.string().trim().min(1).max(80).describe("Delivery city, e.g. Lahore"),
    addressLine: z
      .string()
      .trim()
      .max(300)
      .optional()
      .describe(
        "Street address. Optional for a draft, but needed before the order can be confirmed.",
      ),
    email: z.email().optional().describe("Customer email, only if the seller gave one"),
  }),
  items: z
    .array(
      z.object({
        variantId: z.uuid().describe("UUID of the product variant, from searchProducts"),
        productId: z.uuid().describe("UUID of that variant's product, from searchProducts"),
        quantity: z.int().positive().describe("Number of pieces"),
      }),
    )
    .min(1)
    .max(50)
    .describe("Order lines. Prices are taken from the catalogue, never from you."),
  channel: orderChannelSchema.optional().describe("Where the order came from. Defaults to manual."),
  paymentMethod: orderPaymentMethodSchema
    .optional()
    .describe("cod (cash on delivery) or prepaid. Defaults to cod."),
  shippingFee: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Shipping fee in PKR minor units (paisa). Rs 200 = 20000. Defaults to 0."),
  note: z.string().trim().max(1000).optional().describe("Internal note on the order"),
});

export type CreateDraftOrderToolInput = z.infer<typeof createDraftOrderToolInputSchema>;

function formatRs(amountMinor: number): string {
  return `Rs ${Math.round(amountMinor / 100).toLocaleString("en-PK")}`;
}

function readableError(error: unknown): string {
  if (error instanceof ValidationError) {
    const details = Object.values(error.details ?? {}).flat();
    return details.length > 0 ? `${error.message} ${details.join(" ")}` : error.message;
  }
  if (error instanceof NotFoundError || error instanceof HttpError) return error.message;
  return "Could not create the draft order. Nothing was saved.";
}

/**
 * Write-Side AI Tool: create a DRAFT order, and nothing else.
 *
 * Goes through the same `createDraftOrder` service as the REST API, so line
 * items are resolved under RLS and priced server-side. It never calls
 * transition/confirm, so it cannot move stock: a draft does not touch
 * inventory, confirmation (done by the seller on the Orders page) does.
 */
export function createDraftOrderTool(auth: SellerContext) {
  return {
    description:
      "Create a DRAFT order for a customer. Use searchProducts first to get each variantId and productId. Prices come from the catalogue. The order is only a draft: it does not reserve or deduct stock, and the seller confirms it later on the Orders page. Requires seller approval before executing.",
    inputSchema: createDraftOrderToolInputSchema,
    needsApproval: true,
    execute: async (input: CreateDraftOrderToolInput) => {
      try {
        // Same resolution as GET /workspaces/current. A model-supplied
        // workspace is never trusted, so the tool does not accept one.
        const workspace = await getCurrentWorkspace(auth);

        const serviceInput = createDraftOrderInputSchema.parse({
          workspaceId: workspace.id,
          channel: input.channel ?? "manual",
          paymentMethod: input.paymentMethod ?? "cod",
          ...(input.shippingFee === undefined
            ? {}
            : { shippingFee: { amountMinor: input.shippingFee, currency: "PKR" } }),
          customer: {
            name: input.customer.name,
            phone: input.customer.phone,
            city: input.customer.city,
            ...(input.customer.addressLine ? { addressLine: input.customer.addressLine } : {}),
            ...(input.customer.email ? { email: input.customer.email } : {}),
          },
          items: input.items.map((item) => ({
            variantId: item.variantId,
            productId: item.productId,
            quantity: item.quantity,
          })),
          ...(input.note ? { note: input.note } : {}),
        });

        const order = await createDraftOrder(auth, serviceInput);

        const itemCount = order.items.reduce((sum, line) => sum + line.quantity, 0);
        return {
          status: "success" as const,
          orderId: order.id,
          orderStatus: "draft" as const,
          total: order.total.amountMinor,
          itemCount,
          message: `Draft order for ${order.customer.name} (${order.customer.city}) created — ${formatRs(order.total.amountMinor)}. Confirm it from the Orders page.`,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            status: "error" as const,
            message: `The order details are not valid: ${error.issues.map((i) => i.message).join("; ")}`,
          };
        }
        if (!(error instanceof HttpError)) {
          console.error("createDraftOrder tool failed:", error);
        }
        return { status: "error" as const, message: readableError(error) };
      }
    },
  };
}
