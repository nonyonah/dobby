import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    BACHS_API_KEY: "sk_sandbox_test",
    BACHS_PRO_PRODUCT_ID: "prod_month",
    BACHS_PRO_YEARLY_PRODUCT_ID: "prod_year",
  },
  isProduction: false,
}));

import { createCryptoCheckout, createProCheckout } from "./bachs.js";

function stubSession() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ checkout_id: "chk_test", checkout_url: "https://checkout.bachs.io/c/x" }), { status: 201 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createProCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a product cart for card checkouts", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", interval: "month", method: "card" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.product_cart).toEqual([{ product_id: "prod_month", quantity: 1 }]);
    expect(body.payment_method_options).toBeUndefined();
  });

  it("sends pure pricing with crypto-only methods for crypto checkouts", async () => {
    const fetchMock = stubSession();
    await createCryptoCheckout({ email: "user@example.com", clerkUserId: "user_1", interval: "year", reference: "dobby-test-ref" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.product_cart).toBeUndefined();
    expect(body.pricing).toMatchObject({ base_currency: "USD", amount: "36.00" });
    expect(body.payment_method_options).toEqual({ crypto: {} });
    expect(body.reference).toBe("dobby-test-ref");
  });
});
