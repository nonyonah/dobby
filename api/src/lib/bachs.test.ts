import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    BACHS_API_KEY: "sk_sandbox_test",
    BACHS_PRO_PRODUCT_ID: "prod_month",
    BACHS_PRO_YEARLY_PRODUCT_ID: "prod_year",
  },
  isProduction: false,
}));

import { createProCheckout } from "./bachs.js";

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
  // so it restricted nothing and offered every enabled method.
  it("restricts the checkout to the USD card corridor", async () => {
    const fetchMock = stubSession();
    await createProCheckout({ email: "user@example.com", clerkUserId: "user_1", interval: "month" });
    const body = sentBody(fetchMock);
    expect(body.payment_method_types).toEqual(["USD_CARD"]);
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