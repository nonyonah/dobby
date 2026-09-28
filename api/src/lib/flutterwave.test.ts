import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { FLUTTERWAVE_SECRET_KEY: "FLWSECK_TEST-dummy", FLUTTERWAVE_SECRET_HASH: "test-hash" },
  isProduction: false,
}));

import { FLUTTERWAVE_PRICES, createFlutterwavePayment, flutterwaveWebhookValid, newTxRef, verifyFlutterwaveTransaction } from "./flutterwave.js";

describe("newTxRef", () => {
  it("is unique and prefixed", () => {
    const a = newTxRef("user_123");
    const b = newTxRef("user_123");
    expect(a).not.toBe(b);
    expect(a.startsWith("dobby-")).toBe(true);
  });
});

describe("flutterwaveWebhookValid", () => {
  it("accepts the configured hash and rejects everything else", () => {
    expect(flutterwaveWebhookValid("test-hash")).toBe(true);
    expect(flutterwaveWebhookValid(undefined)).toBe(false);
    expect(flutterwaveWebhookValid("wrong")).toBe(false);
  });
});

describe("flutterwave API calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a hosted payment link", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "success", data: { link: "https://checkout.flutterwave.com/pay/x" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createFlutterwavePayment({
      interval: "month",
      email: "user@example.com",
      txRef: "dobby-test",
      redirectUrl: "http://localhost:3000/settings?payment=flutterwave",
    });
    expect(result.link).toContain("checkout.flutterwave.com");
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ tx_ref: "dobby-test", amount: FLUTTERWAVE_PRICES.month.amount, currency: "NGN" });
  });

  it("verifies a transaction by id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ status: "success", data: { id: 123, tx_ref: "dobby-test", amount: 3500, currency: "NGN", status: "successful" } }),
          { status: 200 },
        ),
      ),
    );
    const verified = await verifyFlutterwaveTransaction(123);
    expect(verified).toMatchObject({ id: 123, txRef: "dobby-test", status: "successful", currency: "NGN" });
  });
});
