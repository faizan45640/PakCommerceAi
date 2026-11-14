import { describe, expect, it } from "vitest";

import { searchFilter } from "./customer-service.js";

describe("searchFilter", () => {
  it("searches name, city, email and phone for a plain term", () => {
    expect(searchFilter("ayesha")).toBe(
      [
        'name.ilike."%ayesha%"',
        'city.ilike."%ayesha%"',
        'email.ilike."%ayesha%"',
        'phone.ilike."%ayesha%"',
      ].join(","),
    );
  });

  it("adds the normalised phone for a typed local number", () => {
    const filter = searchFilter("0300-1234567");
    expect(filter).toContain('phone.ilike."%+923001234567%"');
  });

  it("matches a partial local number against the +92 stored form", () => {
    expect(searchFilter("0300 123")).toContain('phone.ilike."%+92300123%"');
  });

  it("does not add phone patterns for a name", () => {
    expect(searchFilter("Sana")).not.toContain("+92");
  });

  it("drops * so it cannot act as a wildcard", () => {
    expect(searchFilter("*")).toBeNull();
    expect(searchFilter(" ** ")).toBeNull();
    expect(searchFilter("A*a")).toBe(searchFilter("Aa"));
    expect(searchFilter("A*a")).not.toContain("*");
  });

  it("escapes LIKE wildcards and quotes so they cannot rewrite the filter", () => {
    const filter = searchFilter('50%_",x');
    expect(filter).toContain('name.ilike."%50\\\\%\\\\_\\",x%"');
  });
});
