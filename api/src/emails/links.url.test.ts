import { afterEach, describe, expect, it } from "vitest";
import { env } from "../config/env.js";
import { appUrl, publicAppUrl } from "./links.js";

/**
 * The app host the API sends to Bachs.
 *
 * This was reading an `APP_URL` that is not declared anywhere in the env schema,
 * so on production it was always unset and every link resolved to localhost. A
 * `success_url` of `http://localhost:3000` is rejected by Bachs as not publicly
 * accessible, and the rejection only lands once a customer is mid-purchase.
 */

const original = process.env.APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = original;
});

describe("appUrl", () => {
  it("resolves against WEB_ORIGIN, the variable the API actually declares", () => {
    delete process.env.APP_URL;
    expect(appUrl("/settings#plan")).toBe(`${env.WEB_ORIGIN}/settings#plan`);
  });

  it("lets APP_URL override it where a deployment wants a different link host", () => {
    process.env.APP_URL = "https://links.example.com";
    expect(appUrl("/app")).toBe("https://links.example.com/app");
  });

  it("keeps a leading path slash and drops a trailing one from the base", () => {
    process.env.APP_URL = "https://example.com/";
    expect(appUrl("/app")).toBe("https://example.com/app");
    expect(appUrl("app")).toBe("https://example.com/app");
  });
});

describe("publicAppUrl", () => {
  it("refuses a host Bachs could not follow, naming the variable to set", () => {
    process.env.APP_URL = "http://localhost:3000";
    // The message is the fix for whoever hits it: an opaque upstream error at
    // the moment of purchase helps nobody.
    expect(() => publicAppUrl("/settings#plan")).toThrow(/APP_URL|https/);
    expect(() => publicAppUrl("/settings#plan")).toThrow(/http:\/\/localhost:3000/);
  });

  it("passes a public https origin through untouched", () => {
    process.env.APP_URL = "https://dobby.riftlabs.xyz";
    expect(publicAppUrl("/settings#plan")).toBe("https://dobby.riftlabs.xyz/settings#plan");
  });
});
