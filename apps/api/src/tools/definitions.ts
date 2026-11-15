import type { SellerContext } from "../middleware/seller-context.js";
import { getCourierPerformanceTool } from "../copilot/tools/read/courier-performance.js";
import { getCustomerProfileTool } from "../copilot/tools/read/get-customer-profile.js";
import { getSchemaTool } from "../copilot/tools/read/get-schema.js";
import { queryDatabaseTool } from "../copilot/tools/read/query-database.js";
import { runProductSearch, searchProductsTool } from "../copilot/tools/read/search-products.js";
import { createDraftOrderTool } from "../copilot/tools/write/create-draft-order.js";
import { mutateDatabaseTool } from "../copilot/tools/write/mutate-database.js";
import { updateProductPriceTool } from "../copilot/tools/write/update-price.js";
import { updateProductDetailsTool } from "../copilot/tools/write/update-product.js";
import { updateProductStockTool } from "../copilot/tools/write/update-stock.js";
import { checkInventory, checkInventoryInputSchema, compactSearch } from "./sales-agent-tools.js";
import {
  cancelOrderDraft,
  cancelOrderDraftInputSchema,
  confirmOrder,
  confirmOrderInputSchema,
  createOrderDraft,
  createOrderDraftInputSchema,
  getPendingOrder,
  getPendingOrderInputSchema,
} from "./sales-agent-order-tools.js";
import {
  registerTool,
  type ToolAudience,
  type ToolContext,
  type ToolDefinition,
  type ToolOwner,
  type ToolPermission,
} from "./registry.js";

/**
 * Every business tool, registered once.
 *
 * The copilot tools predate the registry. Their logic lives in the original
 * `*Tool(auth)` factories and is NOT rewritten: each definition below wraps its
 * factory, so behaviour is exactly what it was. The factory is called with a
 * context that throws on use just to read the description and schema, then
 * again per call with the real caller.
 */

const NO_CALLER: SellerContext = new Proxy({} as SellerContext, {
  get() {
    throw new Error("Tool metadata was read with a real database call.");
  },
});

interface FactoryTool {
  description: string;
  inputSchema: ToolDefinition["inputSchema"];
  needsApproval?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any) => Promise<unknown>;
}

function sellerAuth(ctx: ToolContext): SellerContext {
  if (!ctx.sellerId) throw new Error("This tool needs a seller.");
  return { sellerId: ctx.sellerId, db: ctx.db };
}

function fromFactory(
  name: string,
  factory: (auth: SellerContext) => FactoryTool,
  meta: { permission: ToolPermission; owner: ToolOwner; redact?: string[]; sqlFields?: string[] },
): ToolDefinition {
  const probe = factory(NO_CALLER);
  return {
    name,
    description: probe.description,
    inputSchema: probe.inputSchema,
    permission: meta.permission,
    owner: meta.owner,
    audiences: ["copilot"],
    needsApproval: probe.needsApproval === true,
    audit: { redact: meta.redact ?? [], sqlFields: meta.sqlFields ?? [] },
    execute: (ctx, input) => factory(sellerAuth(ctx)).execute(input),
  };
}

const searchProducts = fromFactory("searchProducts", searchProductsTool, {
  permission: "read",
  owner: "catalog",
});

registerTool({
  ...searchProducts,
  audiences: ["copilot", "sales_agent"] satisfies ToolAudience[],
  async execute(ctx, input) {
    if (ctx.audience !== "sales_agent") return searchProducts.execute(ctx, input);
    if (!ctx.workspaceId || !ctx.sellerId) throw new Error("Sales agent calls need a workspace.");
    // A buyer only ever sees live products.
    const result = await runProductSearch(sellerAuth(ctx), ctx.workspaceId, {
      ...input,
      statuses: ["active"],
    });
    return compactSearch(ctx, result);
  },
});

registerTool({
  name: "checkInventory",
  description:
    "Check which sizes and colours of one product are in stock, with price in PKR. Pass the productId from searchProducts, and optionally a size and/or colour.",
  inputSchema: checkInventoryInputSchema,
  permission: "read",
  owner: "inventory",
  audiences: ["sales_agent"],
  needsApproval: false,
  audit: {},
  execute: checkInventory,
});

registerTool(
  fromFactory("getCustomerProfile", getCustomerProfileTool, {
    permission: "read",
    owner: "customers",
    redact: ["phone"],
  }),
);
registerTool(
  fromFactory("getSchema", getSchemaTool, { permission: "read", owner: "platform" }),
);
registerTool(
  fromFactory("queryDatabase", queryDatabaseTool, {
    permission: "read",
    owner: "analytics",
    sqlFields: ["sql"],
    redact: ["queryDescription", "summary", "reason"],
  }),
);
registerTool({
  name: "getCourierPerformance",
  description: getCourierPerformanceTool.description,
  inputSchema: getCourierPerformanceTool.inputSchema,
  permission: "read",
  owner: "logistics",
  audiences: ["copilot"],
  needsApproval: false,
  audit: {},
  execute: (_ctx, input) => getCourierPerformanceTool.execute(input),
});

registerTool(
  fromFactory("mutateDatabase", mutateDatabaseTool, {
    permission: "write",
    owner: "platform",
    sqlFields: ["sql"],
    redact: ["queryDescription", "summary", "reason"],
  }),
);
registerTool(
  fromFactory("updateProductStock", updateProductStockTool, {
    permission: "write",
    owner: "inventory",
  }),
);
registerTool(
  fromFactory("updateProductPrice", updateProductPriceTool, {
    permission: "write",
    owner: "catalog",
  }),
);
registerTool(
  fromFactory("updateProductDetails", updateProductDetailsTool, {
    permission: "write",
    owner: "catalog",
  }),
);
registerTool(
  fromFactory("createDraftOrder", createDraftOrderTool, {
    permission: "write",
    owner: "orders",
    redact: ["customer.name", "customer.phone", "customer.addressLine", "customer.email", "notes"],
  }),
);

// --- WhatsApp sales agent: orders (S11). The AI holds the conversation, or it cannot write. ---

registerTool({
  name: "createOrderDraft",
  description:
    "Create a DRAFT order for this buyer after they confirmed the summary (items, name, city, address, payment). Use variantIds from checkInventory. Their phone is already known. Prices and delivery fee are added automatically. Returns the order number and totals: send them to the buyer and ask for a final HAAN. Does not confirm the order.",
  inputSchema: createOrderDraftInputSchema,
  permission: "write",
  owner: "orders",
  audiences: ["sales_agent"],
  needsApproval: false,
  audit: { redact: ["customer.name", "customer.city", "customer.addressLine", "notes"] },
  execute: createOrderDraft,
});

registerTool({
  name: "getPendingOrder",
  description:
    "Get this conversation's open draft order (or null). Use it when the buyer replies about an order you already drafted.",
  inputSchema: getPendingOrderInputSchema,
  permission: "read",
  owner: "orders",
  audiences: ["sales_agent"],
  needsApproval: false,
  audit: {},
  execute: getPendingOrder,
});

registerTool({
  name: "confirmOrder",
  description:
    "Confirm the draft order. Only call it after the buyer replied to your message with the order number and asked for a final HAAN; otherwise it fails with needs_buyer_confirmation. Returns confirmed, or awaiting_seller when the shop owner must approve first.",
  inputSchema: confirmOrderInputSchema,
  permission: "write",
  owner: "orders",
  audiences: ["sales_agent"],
  needsApproval: false,
  audit: {},
  execute: confirmOrder,
});

registerTool({
  name: "cancelOrderDraft",
  description:
    "Cancel this conversation's open draft order, for example when the buyer changes their mind or wants different items.",
  inputSchema: cancelOrderDraftInputSchema,
  permission: "write",
  owner: "orders",
  audiences: ["sales_agent"],
  needsApproval: false,
  audit: { redact: ["reason"] },
  execute: cancelOrderDraft,
});
