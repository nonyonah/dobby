import { describe, expect, it } from "vitest";
import { hashUserId, scrub } from "./sentry.js";

/**
 * The scrubber is the only thing standing between a user's bank statements and
 * a third-party error tracker, so it is tested against the exact shapes this API
 * actually produces.
 */

describe("scrub", () => {
  it("drops monetary fields at any nesting depth", () => {
    const result = scrub({
      amount: "45000.00",
      estimatedTaxOwed: "1200.50",
      income: 90000,
      expenses: 45000,
      balance: "1234.56",
      safe: "keep me",
    }) as Record<string, unknown>;

    expect(result).toEqual({ safe: "keep me" });
  });

  it("drops credentials and connection strings but keeps routing context", () => {
    const result = scrub({
      DATABASE_URL: "postgresql://user:hunter2@host:5432/db",
      CLERK_SECRET_KEY: "sk_test_abc",
      resendApiKey: "re_secret",
      authorization: "Bearer abc.def.ghi",
      token: "sometoken",
      // `pathname` contains the substring "name" but carries no personal data,
      // and losing it would defeat the point of the report.
      pathname: "/v1/transactions",
      method: "POST",
    }) as Record<string, unknown>;

    expect(result).toEqual({ pathname: "/v1/transactions", method: "POST" });
  });

  it("drops prefixed spellings of denied fragments", () => {
    const result = scrub({
      userEmail: "someone@example.com",
      xApiKey: "abc",
      stripeSecretKey: "sk_live_x",
      userName: "ada",
    });
    expect(result).toEqual({});
  });

  it("drops direct personal identifiers", () => {
    const result = scrub({
      email: "someone@example.com",
      firstName: "Ada",
      merchant: "ACME Coffee",
      description: "salary payment",
      fingerprint: "fp-abc123",
    });
    expect(result).toEqual({});
  });

  it("redacts wallet addresses even under an innocuous key", () => {
    const result = scrub({
      // `note` is denied outright, so an address hiding in it is dropped whole.
      note: "sent to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      // These keys survive, so only the address can be removed.
      reference: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
      destination: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      label: "wallet transfer",
    }) as Record<string, unknown>;

    expect(result.note).toBeUndefined();
    expect(result.reference).toBe("[redacted-address]");
    expect(result.destination).toBe("[redacted-address]");
    expect(result.label).toBe("wallet transfer");
  });

  it("strips denied keys nested inside objects and arrays", () => {
    const result = scrub({
      items: [
        { id: "t1", amount: "99.99", category: "Food" },
        { id: "t2", amount: "10.00", category: "Fuel" },
      ],
    }) as { items: Array<Record<string, unknown>> };

    expect(result.items).toEqual([
      { id: "t1", category: "Food" },
      { id: "t2", category: "Fuel" },
    ]);
  });

  it("bounds recursion and array size so a payload cannot be used as a DoS vector", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 40; i += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    expect(() => JSON.stringify(scrub(deep))).not.toThrow();
    expect((scrub(Array.from({ length: 500 }, (_, i) => i)) as unknown[]).length).toBeLessThanOrEqual(25);
  });

  it("passes through non-sensitive primitives", () => {
    expect(scrub({ code: "VALIDATION_ERROR", statusCode: 400, ok: true })).toEqual({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      ok: true,
    });
  });
});

describe("hashUserId", () => {
  it("is stable, short, and not the raw id", () => {
    const raw = "user_2abcDEF123";
    const hashed = hashUserId(raw);
    expect(hashed).toBe(hashUserId(raw));
    expect(hashed).not.toContain(raw);
    expect(hashed).toMatch(/^u_[0-9a-f]{8}$/);
  });

  it("returns undefined for a missing id rather than a placeholder", () => {
    expect(hashUserId(undefined)).toBeUndefined();
    expect(hashUserId(null)).toBeUndefined();
    expect(hashUserId("")).toBeUndefined();
  });

  it("separates distinct ids", () => {
    expect(hashUserId("user_a")).not.toBe(hashUserId("user_b"));
  });
});