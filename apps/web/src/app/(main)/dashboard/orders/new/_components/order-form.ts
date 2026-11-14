import type { CreateDraftOrderInput, ProductVariant } from "@pakcommerce/shared";
import { createDraftOrderInputSchema } from "@pakcommerce/shared/orders";

export interface CartLine {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  /** Variant price when the line was added. The server snapshots its own. */
  unitPriceMinor: number;
  /** on hand - reserved; null when the variant does not track inventory. */
  available: number | null;
  quantity: number;
}

export type CartAction =
  | { type: "add"; line: CartLine }
  | { type: "remove"; variantId: string }
  | { type: "setQuantity"; variantId: string; quantity: number };

/** Adding a variant that is already in the cart bumps its quantity instead of duplicating it. */
export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      const existing = lines.find((line) => line.variantId === action.line.variantId);
      if (!existing) return [...lines, action.line];
      return lines.map((line) =>
        line.variantId === action.line.variantId
          ? { ...line, quantity: line.quantity + action.line.quantity }
          : line,
      );
    }
    case "remove":
      return lines.filter((line) => line.variantId !== action.variantId);
    case "setQuantity":
      return lines.map((line) =>
        line.variantId === action.variantId ? { ...line, quantity: action.quantity } : line,
      );
  }
}

/** Sellable stock for a variant, or null when stock is not tracked. */
export function availableStock(variant: ProductVariant): number | null {
  const { trackInventory, quantityOnHand, reservedQuantity } = variant.inventory;
  if (!trackInventory || quantityOnHand === null) return null;
  return Math.max(0, quantityOnHand - reservedQuantity);
}

export function exceedsStock(line: CartLine): boolean {
  return line.available !== null && line.quantity > line.available;
}

/**
 * Rupees typed by the seller to integer minor units. Blank means no fee (0);
 * returns null for anything that is not a non-negative amount.
 */
export function rupeesToMinor(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function estimateTotals(lines: CartLine[], shippingMinor: number) {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
  return { subtotalMinor, shippingMinor, totalMinor: subtotalMinor + shippingMinor };
}

export interface OrderFormValues {
  name: string;
  phone: string;
  city: string;
  addressLine: string;
  email: string;
  channel: CreateDraftOrderInput["channel"];
  paymentMethod: CreateDraftOrderInput["paymentMethod"];
  shippingFee: string;
  note: string;
}

export const emptyOrderForm: OrderFormValues = {
  name: "",
  phone: "",
  city: "",
  addressLine: "",
  email: "",
  channel: "manual",
  paymentMethod: "cod",
  shippingFee: "",
  note: "",
};

/** Sends only ids and quantities per line; the server snapshots price, title and SKU. */
export function buildDraftInput(
  workspaceId: string,
  values: OrderFormValues,
  lines: CartLine[],
  shippingMinor: number,
): CreateDraftOrderInput {
  const optional = (text: string) => (text.trim() === "" ? undefined : text.trim());
  return {
    workspaceId,
    channel: values.channel,
    paymentMethod: values.paymentMethod,
    shippingFee: { amountMinor: shippingMinor, currency: "PKR" },
    customer: {
      name: values.name.trim(),
      phone: values.phone.trim(),
      city: values.city.trim(),
      email: optional(values.email),
      addressLine: optional(values.addressLine),
    },
    items: lines.map((line) => ({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
    })),
    note: optional(values.note),
  };
}

export interface FormErrors {
  /** Keyed by dotted path, e.g. "customer.phone", "shippingFee". */
  fields: Record<string, string>;
  /** Keyed by line index, from "items.<index>.<field>". */
  lines: Record<number, string>;
  /** Everything else (paths we show no field for, or "_"). */
  general: string[];
}

const FIELD_PATHS = [
  "customer.name",
  "customer.phone",
  "customer.city",
  "customer.email",
  "customer.addressLine",
  "channel",
  "paymentMethod",
  "shippingFee",
  "note",
];

/** Maps `{ "customer.phone": ["..."] }` (server details or Zod issues) onto fields and lines. */
export function mapDetailsToErrors(details: Record<string, string[]> | undefined): FormErrors {
  const errors: FormErrors = { fields: {}, lines: {}, general: [] };
  for (const [path, messages] of Object.entries(details ?? {})) {
    const message = messages.join(" ");
    const lineMatch = /^items\.(\d+)(\.|$)/.exec(path);
    const fieldPath = FIELD_PATHS.find((known) => path === known || path.startsWith(`${known}.`));
    if (lineMatch) {
      errors.lines[Number(lineMatch[1])] = message;
    } else if (fieldPath) {
      errors.fields[fieldPath] = message;
    } else if (path === "items") {
      errors.general.push(`Items: ${message}`);
    } else {
      errors.general.push(path === "_" ? message : `${path}: ${message}`);
    }
  }
  return errors;
}

export function hasErrors(errors: FormErrors): boolean {
  return (
    Object.keys(errors.fields).length > 0 ||
    Object.keys(errors.lines).length > 0 ||
    errors.general.length > 0
  );
}

export const ADDRESS_REQUIRED_MESSAGE =
  "Address line is required. A draft without an address can't be confirmed.";

/**
 * Parses a typed quantity into a positive integer, or null when it is blank,
 * zero, negative, fractional or not a number.
 */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return Number.isSafeInteger(quantity) && quantity >= 1 ? quantity : null;
}

export const QUANTITY_INVALID_MESSAGE = "Enter a whole number of 1 or more.";

/**
 * Client-side check: the same schema the API uses, plus the form's own rule that the
 * address is required (the API keeps it optional, but a draft without one can never
 * be confirmed and drafts cannot be edited).
 */
export function validateDraftInput(input: CreateDraftOrderInput): FormErrors {
  const result = createDraftOrderInputSchema.safeParse(input);
  const details: Record<string, string[]> = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      (details[key] ??= []).push(issue.message);
    }
  }
  if (!input.customer.addressLine && !details["customer.addressLine"]) {
    details["customer.addressLine"] = [ADDRESS_REQUIRED_MESSAGE];
  }
  return mapDetailsToErrors(details);
}
