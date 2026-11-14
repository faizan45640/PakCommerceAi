import { describe, expect, it } from "vitest";

import { customerProfileHref } from "./customer-links";

describe("customerProfileHref", () => {
  it("links the profile by customer id", () => {
    expect(customerProfileHref({ customerId: "abc" })).toBe("/dashboard/customers/abc");
  });

  it("links by phone through the normalised list hook", () => {
    expect(customerProfileHref({ phone: "0300-1234567" })).toBe(
      "/dashboard/customers?phone=%2B923001234567",
    );
  });
});
