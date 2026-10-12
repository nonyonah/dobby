import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    BACHS_API_KEY: "sk_sandbox_test",
    BACHS_PRO_PRODUCT_ID: "prod_month",
    BACHS_PRO_YEARLY_PRODUCT_ID: "prod_year",
  },
  isProduction: false,
}));

import {  createProCheckout , oneTimeCorridorWarnings } from "./bachs.js";

function stubSession() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ checkout_id: "chk_test", checkout_url: "https://checkout.bachs.io/c/x" }), { status: 201 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubSession>) {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe("createProCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sells the catalog product for the requested cadence", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", interval: "month" });
    expect(sentBody(fetchMock).product_cart).toEqual([{ product_id: "prod_month", quantity: 1 }]);
  });

  it("uses the yearly product for the yearly cadence", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", interval: "year" });
    expect(sentBody(fetchMock).product_cart).toEqual([{ product_id: "prod_year", quantity: 1 }]);
  });

  // The API takes `payment_method_types` as an array of exact corridors. The
  // earlier `payment_method_options: { crypto: {} }` named no field that exists,
  // so it restricted nothing and offered every enabled method — which is where
  // we want to be now. Naming `["USD_CARD"]` then pinned the page to a card and
  // left anyone paying by transfer or crypto with nothing to choose.
  it("leaves the payment corridors to Bachs so every enabled one is offered", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", interval: "month" });
    const body = sentBody(fetchMock);
    // Absent, not empty: sending `[]` is a restriction to nothing.
    expect(body).not.toHaveProperty("payment_method_types");
    expect(body).not.toHaveProperty("payment_method_options");
  });

  // A raw-amount checkout would need `pricing.currency`, which is required.
  // Subscriptions are catalog products, so no pricing block is sent at all.
  it("sends no raw pricing block", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", interval: "month" });
    expect(sentBody(fetchMock)).not.toHaveProperty("pricing");
  });

  it("identifies the customer and carries the Clerk id the webhook matches on", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", name: "Ada L", clerkUserId: "user_1", interval: "month" });
    const body = sentBody(fetchMock);
    expect(body.customer).toEqual({ email: "user@example.com", name: "Ada L" });
    expect(body.metadata).toEqual({ clerk_user_id: "user_1" });
  });

  it("omits a blank name rather than sending an empty string", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", name: "", clerkUserId: "user_1", interval: "month" });
    expect(sentBody(fetchMock).customer).toEqual({ email: "user@example.com" });
  });
});
/**
 * `enabled_payment_methods` is keyed by corridor, not an array. An earlier
 * version of this file typed it as an array and called `.filter()` on it, which
 * throws on an object — inside the checkout-creation path, so the symptom was a
 * 500 with "Bachs is broken" rather than a warning anyone read.
 */
describe("oneTimeCorridorWarnings", () => {
  const account = {
    adaptive_pricing: true,
    enabled_payment_methods: {
      NGN_BANK_TRANSFER: { enabled: true },
      CRYPTO: { enabled: true, currencies: { ETH_ETH: true, SOL_SOL: true } },
      USD_CARD: { enabled: true },
    },
  };

  it("says nothing about a correctly configured account", () => {
    expect(oneTimeCorridorWarnings(account)).toEqual([]);
  });

  it("names adaptive pricing when it is off", () => {
    const warnings = oneTimeCorridorWarnings({ ...account, adaptive_pricing: false });
    expect(warnings.join(" ")).toMatch(/adaptive pricing is OFF/i);
  });

  it("names a corridor the account has not enabled", () => {
    const warnings = oneTimeCorridorWarnings({
      adaptive_pricing: true,
      enabled_payment_methods: { USD_CARD: { enabled: true } },
    });
    expect(warnings.join(" ")).toMatch(/NGN_BANK_TRANSFER/);
    expect(warnings.join(" ")).toMatch(/CRYPTO/);
  });

  it("catches CRYPTO that is enabled but offers nothing", () => {
    // Enabled with every asset false is the case that looks configured and is not.
    const warnings = oneTimeCorridorWarnings({
      adaptive_pricing: true,
      enabled_payment_methods: {
        NGN_BANK_TRANSFER: { enabled: true },
        CRYPTO: { enabled: true, currencies: { ETH_ETH: false, SOL_SOL: false } },
      },
    });
    expect(warnings.join(" ")).toMatch(/all 2 assets/i);
  });

  it("survives an account with no methods listed at all", () => {
    expect(() => oneTimeCorridorWarnings({})).not.toThrow();
    expect(oneTimeCorridorWarnings({}).length).toBeGreaterThan(0);
  });
});
