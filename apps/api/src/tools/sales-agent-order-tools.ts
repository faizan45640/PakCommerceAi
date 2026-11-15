import { createDraftOrderInputSchema, type Order } from "@pakcommerce/shared";
import { z } from "zod";

import { ConflictError, HttpError, ValidationError } from "../lib/http-errors.js";
import { createDraftOrder, getOrder } from "../orders/order-service.js";
import { toStockChecks, type VariantStockRow } from "../orders/order-mapper.js";
import { loadOrderSettings } from "../sales-agent/settings-service.js";
import { ToolError, type ToolContext } from "./registry.js";

/**
 * The sales agent's order tools (S11, T-085).
 *
 * Safety model, in the order it matters:
 *  - Workspace, seller, conversation and the buyer's phone come from the
 *    conversation row (agent-router.ts), never from the model. The input schemas
 *    have no phone or workspace field, and unknown keys are stripped.
 *  - Prices come from the catalogue and the shipping fee from the seller's
 *    settings, never from the model.
 *  - The AI can only act on its OWN draft for THIS conversation.
 *  - Confirming needs a second buyer message after the draft was created. That
 *    rule and the `ai_active` re-check run inside the database
 *    (ai_confirm_order / create_draft_order), under a row lock on the
 *    conversation, so a seller taking over in between wins (write-gate.ts).
 */

/** Short human reference for an order, e.g. "A1B2C3D4". */
export function orderRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

function need(ctx: ToolContext) {
  if (!ctx.workspaceId || !ctx.sellerId || !ctx.conversationId) {
    throw new Error("Sales agent order tools need a conversation.");
  }
  return { workspaceId: ctx.workspaceId, sellerId: ctx.sellerId, conversationId: ctx.conversationId };
}

export interface AgentOrder {
  orderId: string;
  orderRef: string;
  status: "draft";
  items: {
    product: string;
    variant: string | null;
    quantity: number;
    unitPricePkr: number;
    lineTotalPkr: number;
  }[];
  subtotalPkr: number;
  shippingFeePkr: number;
  totalPkr: number;
  paymentMethod: "cod" | "prepaid";
  city: string;
  addressLine: string | null;
}

/** Compact, buyer-safe view of an order. No phone, no ids except the order id. */
export function toAgentOrder(order: Order): AgentOrder {
  return {
    orderId: order.id,
    orderRef: orderRef(order.id),
    status: "draft",
    items: order.items.map((line) => ({
      product: line.title,
      variant: line.variantTitle ?? null,
      quantity: line.quantity,
      unitPricePkr: line.unitPrice.amountMinor / 100,
      lineTotalPkr: line.lineTotal.amountMinor / 100,
    })),
    subtotalPkr: order.subtotal.amountMinor / 100,
    shippingFeePkr: order.shippingFee.amountMinor / 100,
    totalPkr: order.total.amountMinor / 100,
    paymentMethod: order.paymentMethod,
    city: order.customer.city,
    addressLine: order.customer.addressLine ?? null,
  };
}

// --- createOrderDraft ---------------------------------------------------------

export const createOrderDraftInputSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.uuid().describe("variantId from checkInventory"),
        quantity: z.int().min(1).max(20),
      }),
    )
    .min(1)
    .max(10)
    .describe("What the buyer wants. Prices come from the catalogue."),
  customer: z.object({
    name: z.string().trim().min(1).max(120).describe("Buyer's name for delivery"),
    city: z.string().trim().min(1).max(80),
    addressLine: z.string().trim().min(5).max(300).describe("Full delivery address"),
  }),
  paymentMethod: z.enum(["cod", "prepaid"]).default("cod"),
  notes: z.string().trim().max(300).optional(),
});

export type CreateOrderDraftInput = z.infer<typeof createOrderDraftInputSchema>;

interface VariantRow extends VariantStockRow {
  product_id: string;
  title: string;
  products: { title: string; status: string } | { title: string; status: string }[] | null;
  status: string;
}

async function loadOpenDraft(ctx: ToolContext): Promise<{ id: string } | null> {
  const { workspaceId, conversationId } = need(ctx);
  const { data, error } = await ctx.db
    .from("orders")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("conversation_id", conversationId)
    .eq("created_via", "whatsapp_ai")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function draftExists(id: string): ToolError {
  return new ToolError(
    "draft_exists",
    `This conversation already has an open draft order (orderId ${id}). Use getPendingOrder, confirmOrder or cancelOrderDraft.`,
    409,
  );
}

export async function createOrderDraft(ctx: ToolContext, input: CreateOrderDraftInput) {
  const { workspaceId, sellerId, conversationId } = need(ctx);

  const existing = await loadOpenDraft(ctx);
  if (existing) throw draftExists(existing.id);

  const { data: conversation, error: conversationError } = await ctx.db
    .from("conversations")
    .select("buyer_phone")
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  if (!conversation) throw new ToolError("not_found", "No such conversation.", 404);

  // One line per variant.
  const wanted = new Map<string, number>();
  for (const item of input.items) {
    wanted.set(item.variantId, (wanted.get(item.variantId) ?? 0) + item.quantity);
  }

  const { data: variants, error: variantError } = await ctx.db
    .from("product_variants")
    .select(
      "id, product_id, title, status, track_inventory, quantity_on_hand, reserved_quantity, products!inner(title, status)",
    )
    .eq("workspace_id", workspaceId)
    .in("id", [...wanted.keys()]);
  if (variantError) throw new Error(variantError.message);

  const byId = new Map(((variants ?? []) as unknown as VariantRow[]).map((row) => [row.id, row]));
  const lines: { variantId: string; productId: string; quantity: number }[] = [];
  for (const [variantId, quantity] of wanted) {
    const row = byId.get(variantId);
    const product = Array.isArray(row?.products) ? row?.products[0] : row?.products;
    // A buyer can only order what a buyer can see: live products and variants.
    if (!row || row.status !== "active" || product?.status !== "active") {
      throw new ToolError("variant_not_found", `Variant ${variantId} is not available.`, 404);
    }
    lines.push({ variantId, productId: row.product_id, quantity });
  }

  assertStock(
    lines.map((line) => ({
      variantId: line.variantId,
      productId: line.productId,
      quantity: line.quantity,
      title: byId.get(line.variantId)?.products
        ? productTitle(byId.get(line.variantId) as VariantRow)
        : "Item",
      variantTitle: byId.get(line.variantId)?.title ?? null,
    })),
    [...byId.values()],
  );

  const settings = await loadOrderSettings(ctx.db, workspaceId);

  let order: Order;
  try {
    const serviceInput = createDraftOrderInputSchema.parse({
      workspaceId,
      channel: "whatsapp",
      paymentMethod: input.paymentMethod,
      shippingFee: { amountMinor: settings.shippingFeeMinor, currency: "PKR" },
      customer: {
        name: input.customer.name,
        phone: conversation.buyer_phone,
        city: input.customer.city,
        addressLine: input.customer.addressLine,
      },
      items: lines,
      ...(input.notes ? { note: input.notes } : {}),
    });
    order = await createDraftOrder({ sellerId, db: ctx.db }, serviceInput, {
      createdVia: "whatsapp_ai",
      conversationId,
      ...(ctx.toolCallId ? { toolCallId: ctx.toolCallId } : {}),
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      const open = await loadOpenDraft(ctx);
      if (open) throw draftExists(open.id);
      throw new ToolError("ai_not_allowed", "The AI does not hold this conversation.", 403);
    }
    if (error instanceof ValidationError) {
      const details = Object.values(error.details ?? {}).flat();
      throw new ToolError(
        "invalid_order",
        details.length ? `${error.message} ${details.join(" ")}` : error.message,
      );
    }
    if (error instanceof z.ZodError) {
      throw new ToolError(
        "invalid_order",
        `The order details are not valid: ${error.issues.map((issue) => issue.message).join("; ")}`,
      );
    }
    if (error instanceof HttpError) throw new ToolError("invalid_order", error.message, error.status);
    throw error;
  }

  return toAgentOrder(order);
}

function productTitle(row: VariantRow): string {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  return product?.title ?? "Item";
}

/** Throws `insufficient_stock` naming the first item that is short. */
function assertStock(
  lines: {
    variantId: string;
    productId: string;
    quantity: number;
    title: string;
    variantTitle: string | null;
  }[],
  variantRows: VariantStockRow[],
): void {
  const checks = toStockChecks(
    lines.map((line) => ({
      id: line.variantId,
      orderId: "",
      productId: line.productId,
      variantId: line.variantId,
      title: line.title,
      variantTitle: line.variantTitle,
      quantity: line.quantity,
      unitPrice: { amountMinor: 0, currency: "PKR" as const },
      lineTotal: { amountMinor: 0, currency: "PKR" as const },
      createdAt: "",
      updatedAt: "",
    })),
    variantRows,
  );
  const short = checks.find((check) => !check.sufficient);
  if (short) {
    const label = short.variantTitle ? `${short.title} (${short.variantTitle})` : short.title;
    throw new ToolError(
      "insufficient_stock",
      `Not enough stock for ${label}: ${short.available ?? 0} available, ${short.needed} wanted.`,
      409,
    );
  }
}

// --- getPendingOrder ----------------------------------------------------------

export const getPendingOrderInputSchema = z.object({});

export async function getPendingOrder(ctx: ToolContext) {
  const { workspaceId } = need(ctx);
  const open = await loadOpenDraft(ctx);
  if (!open) return { order: null };
  return { order: toAgentOrder(await getOrder({ sellerId: ctx.sellerId as string, db: ctx.db }, workspaceId, open.id)) };
}

// --- confirmOrder / cancelOrderDraft -----------------------------------------

export const confirmOrderInputSchema = z.object({
  orderId: z.uuid().describe("orderId from createOrderDraft or getPendingOrder"),
});

export const cancelOrderDraftInputSchema = z.object({
  orderId: z.uuid(),
  reason: z.string().trim().max(200).optional(),
});

/** The AI's own open draft for this conversation, as an Order, or not_found / not_draft. */
async function ownDraft(ctx: ToolContext, orderId: string): Promise<Order> {
  const { workspaceId, sellerId, conversationId } = need(ctx);
  const { data, error } = await ctx.db
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("workspace_id", workspaceId)
    .eq("conversation_id", conversationId)
    .eq("created_via", "whatsapp_ai")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new ToolError("not_found", "No such order in this conversation.", 404);
  if (data.status !== "draft") {
    throw new ToolError("not_draft", `The order is already ${data.status}.`, 409);
  }
  return getOrder({ sellerId, db: ctx.db }, workspaceId, orderId);
}

interface RpcError {
  message: string;
  details?: string | null;
}

/** Maps what ai_confirm_order / ai_cancel_order_draft / transition_order_status raise. */
function toToolError(error: RpcError): ToolError | Error {
  switch (error.message.trim()) {
    case "not_found":
      return new ToolError("not_found", "No such order in this conversation.", 404);
    case "not_draft":
      return new ToolError("not_draft", "The order is no longer a draft.", 409);
    case "ai_not_allowed":
      return new ToolError("ai_not_allowed", "The AI does not hold this conversation.", 403);
    case "needs_buyer_confirmation":
      return new ToolError(
        "needs_buyer_confirmation",
        "The buyer has not confirmed since the draft was created. Send them the order number and total, ask for a final HAAN, and call confirmOrder only after they reply.",
        409,
      );
    case "insufficient_stock":
      return new ToolError("insufficient_stock", "Not enough stock to confirm this order.", 409);
    default:
      return new Error(error.message);
  }
}

export async function confirmOrder(ctx: ToolContext, input: z.infer<typeof confirmOrderInputSchema>) {
  const { workspaceId, conversationId } = need(ctx);
  const order = await ownDraft(ctx, input.orderId);
  const ref = orderRef(order.id);

  // Re-check stock now, so the buyer hears "sold out" instead of a failed confirm.
  const { data: variantRows, error: stockError } = await ctx.db
    .from("product_variants")
    .select("id, track_inventory, quantity_on_hand, reserved_quantity")
    .eq("workspace_id", workspaceId)
    .in("id", [...new Set(order.items.map((line) => line.variantId))]);
  if (stockError) throw new Error(stockError.message);
  const short = toStockChecks(order.items, variantRows ?? []).find((check) => !check.sufficient);
  if (short) {
    const label = short.variantTitle ? `${short.title} (${short.variantTitle})` : short.title;
    throw new ToolError(
      "insufficient_stock",
      `Not enough stock for ${label}: ${short.available ?? 0} available, ${short.needed} wanted.`,
      409,
    );
  }

  const settings = await loadOrderSettings(ctx.db, workspaceId);

  const { data, error } = await ctx.db.rpc("ai_confirm_order", {
    p_order_id: order.id,
    p_conversation_id: conversationId,
    p_auto_confirm: settings.autoConfirmOrders,
    p_handoff_reason: `Order ${ref} needs your approval`,
  });
  if (error) {
    if (error.message.trim() === "insufficient_stock") {
      const [variantId, available, needed] = (error.details ?? "").split(":");
      const line = order.items.find((item) => item.variantId === variantId);
      throw new ToolError(
        "insufficient_stock",
        `Not enough stock for ${line?.title ?? "an item"}: ${available ?? 0} available, ${needed ?? "?"} wanted.`,
        409,
      );
    }
    throw toToolError(error);
  }

  return {
    status: data === "confirmed" ? ("confirmed" as const) : ("awaiting_seller" as const),
    orderRef: ref,
  };
}

export async function cancelOrderDraft(
  ctx: ToolContext,
  input: z.infer<typeof cancelOrderDraftInputSchema>,
) {
  const { conversationId } = need(ctx);
  const order = await ownDraft(ctx, input.orderId);

  const { error } = await ctx.db.rpc("ai_cancel_order_draft", {
    p_order_id: order.id,
    p_conversation_id: conversationId,
    p_note: input.reason ? `Cancelled by the WhatsApp AI: ${input.reason}` : "Cancelled by the WhatsApp AI",
  });
  if (error) throw toToolError(error);

  return { status: "cancelled" as const, orderRef: orderRef(order.id) };
}
