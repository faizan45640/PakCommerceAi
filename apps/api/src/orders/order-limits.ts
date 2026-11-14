import { MAX_MONEY_MINOR } from "@pakcommerce/shared";

import { ValidationError } from "../lib/http-errors.js";

/**
 * Money columns are Postgres `integer`. Catalogue prices are capped at the same
 * limit, but quantity x price can still overflow, so check line totals, subtotal
 * and total here and answer 400 instead of letting the database fail with a 500.
 */
export function assertDraftAmountsFit(
  lines: { unitPriceAmountMinor: number; quantity: number }[],
  shippingFeeMinor: number,
): void {
  let subtotal = 0;
  for (const [index, line] of lines.entries()) {
    const lineTotal = line.unitPriceAmountMinor * line.quantity;
    if (lineTotal > MAX_MONEY_MINOR) {
      throw new ValidationError("One or more line items are invalid.", {
        [`items.${index}.quantity`]: ["Line total is too large. Lower the quantity."],
      });
    }
    subtotal += lineTotal;
  }
  if (subtotal > MAX_MONEY_MINOR || subtotal + shippingFeeMinor > MAX_MONEY_MINOR) {
    throw new ValidationError("The order total is too large.", {
      total: ["Order total exceeds the maximum amount. Remove items or lower quantities."],
    });
  }
}
