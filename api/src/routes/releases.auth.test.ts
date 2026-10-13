import { describe, expect, it } from "vitest";
import { maySendReleaseTo } from "./releases.js";

/**
 * An open mail relay behind a login.
 *
 * `POST /v1/releases/send` exists so a release can be previewed against one
 * real inbox before it goes out. It took `clerkId` from the request body and
 * emailed whoever that named, with no check against the caller — so any
 * signed-in user could point it at another account and have Dobby send them
 * mail, indefinitely, at no rate limit worth the name.
 *
 * The rule is narrow on purpose: a preview of your own inbox is the whole use
 * case. Broadcasting is a separate concern and was already refused.
 */

const CALLER = "user_2abcDEF";

describe("release preview authorisation", () => {
  it("lets a user send a preview to themselves", () => {
    expect(maySendReleaseTo(CALLER, CALLER)).toBe(true);
  });

  it("refuses to send to another account", () => {
    expect(maySendReleaseTo(CALLER, "user_someoneElse")).toBe(false);
  });

  it("refuses when the caller is somehow unauthenticated", () => {
    // `requireAuth` should make this unreachable, but the check should not be
    // the only thing standing between an unauthenticated call and an email.
    expect(maySendReleaseTo(undefined, "user_whoever")).toBe(false);
    expect(maySendReleaseTo("", "user_whoever")).toBe(false);
  });

  it("is not fooled by shared prefixes", () => {
    expect(maySendReleaseTo("user_2abcDEF", "user_2abcDEFghi")).toBe(false);
    expect(maySendReleaseTo("user_2abcDEFevil", "user_2abcDEF")).toBe(false);
  });
});