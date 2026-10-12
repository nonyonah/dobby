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

/**
 * A one-time checkout, not a catalog product.
 *
 * The product cannot be a recurring one: Bachs can only re-charge a card, so a
 * subscription page offers a USD card and nothing else, and the rails a customer
 * in this market actually uses simply do not appear. A raw `pricing` session is a
 * plain payment and may be transfer, crypto or card depending on the currency
 * the customer picks.
 *
 * `save_payment_method` is what keeps auto-renewal alive for the card payers.
 */
describe("createProCheckout", () => {
  const price = { amount: "4.00", currency: "USD", interval: "month" as const };

  it("prices a raw amount instead of putting a product in a cart", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", price });
    const body = sentBody(fetchMock);
    expect(body.pricing).toEqual({ currency: "USD", amount: "4.00" });
    // A cart and a price are mutually exclusive; sending both is refused.
    expect(body).not.toHaveProperty("product_cart");
  });

  it("does not ask to save the card, because that is what removes the other rails", async () => {
    // Measured on this account, identical session otherwise:
    //   save_payment_method: true -> USD card, NGN card
    //   without it                -> + NGN bank transfer, crypto
    // A checkout that keeps a payment method can only offer methods that can be
    // saved, which is cards. Asking for it costs bank transfer and crypto, so it
    // is not asked for.
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", price });
    expect(sentBody(fetchMock)).not.toHaveProperty("save_payment_method");
  });

  it("carries the plan so a renewal charges what was agreed", async () => {
    const fetchMock = stubSession();
    await createProCheckout({
      email: "user@example.com",
      clerkUserId: "user_1",
      price: { amount: "36.00", currency: "USD", interval: "year" },
    });
    expect(sentBody(fetchMock).metadata).toMatchObject({ clerk_user_id: "user_1", plan_interval: "year" });
  });

  it("sends no corridor restriction, so every enabled rail is offered", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", price });
    const body = sentBody(fetchMock);
    // Absent, not empty: sending `[]` restricts to nothing.
    expect(body).not.toHaveProperty("payment_method_types");
    expect(body).not.toHaveProperty("payment_method_options");
  });

  it("passes pinned currency prices through when there are any", async () => {
    const fetchMock = stubSession();
    await createProCheckout({
      email: "user@example.com",
      clerkUserId: "user_1",
      price: { ...price, currencyOptions: { NGN: "6000.00" } },
    });
    expect(sentBody(fetchMock).pricing).toMatchObject({ currency_options: { NGN: "6000.00" } });
  });

  it("omits currency_options entirely when none are set", async () => {
    // Left to adaptive pricing, which converts at the rate of the moment. A
    // hardcoded figure here would go stale against that and overcharge.
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", price });
    expect(sentBody(fetchMock).pricing).not.toHaveProperty("currency_options");
  });

  it("reuses an existing customer so the saved card has somewhere to live", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", customerId: "cust_9", price });
    expect(sentBody(fetchMock).customer).toEqual({ customer_id: "cust_9" });
  });

  it("creates a customer for a first-time buyer, so a card can be saved to it", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", name: "Ada L", clerkUserId: "user_1", price });
    expect(sentBody(fetchMock).customer).toMatchObject({ email: "user@example.com", name: "Ada L", customer_creation: "always" });
  });

  it("omits a blank name rather than sending an empty string", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", name: "", clerkUserId: "user_1", price });
    expect(sentBody(fetchMock).customer).toMatchObject({ email: "user@example.com" });
    expect(sentBody(fetchMock).customer).not.toHaveProperty("name");
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
