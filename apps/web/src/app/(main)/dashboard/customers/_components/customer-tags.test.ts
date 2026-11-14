import { customerTagValues } from "@pakcommerce/shared/customers";
import { describe, expect, it } from "vitest";

import { CUSTOMER_TAG_CLASSES, CUSTOMER_TAG_DESCRIPTIONS, CUSTOMER_TAG_LABELS } from "./customer-tags";

describe("customer tag metadata", () => {
  it("covers every tag the API can return", () => {
    for (const tag of customerTagValues) {
      expect(CUSTOMER_TAG_LABELS[tag]).toBeTruthy();
      expect(CUSTOMER_TAG_DESCRIPTIONS[tag]).toBeTruthy();
      expect(CUSTOMER_TAG_CLASSES[tag]).toBeTruthy();
    }
  });

  it("explains the tags the way the API derives them", () => {
    expect(CUSTOMER_TAG_DESCRIPTIONS.first_time).toBe("No completed order yet");
    expect(CUSTOMER_TAG_DESCRIPTIONS.repeat).toBe("2+ completed orders");
  });
});
