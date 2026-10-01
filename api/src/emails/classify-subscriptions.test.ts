import { describe, expect, it } from "vitest";
import { classifyEmail, gmailQueries } from "./classify.js";

describe("classify: subscription receipts (no attachment)", () => {
  const cases: Array<[string, string, string]> = [
    ["YouTube Premium", "YouTube <no-reply@youtube.com>", "Your YouTube Premium receipt"],
    ["Google Play YouTube", "Google Play <no-reply@play.google.com>", "YouTube Premium subscription renewed"],
    ["Netflix", "Netflix <info@netflix.com>", "Your Netflix membership has been renewed"],
    ["Spotify", "Spotify <no-reply@spotify.com>", "Your order confirmation for Premium Individual"],
    ["Apple", "Apple <no-reply@apple.com>", "Your receipt from Apple"],
  ];
  for (const [name, from, subject] of cases) {
    it(`${name} -> receipt`, () => {
      expect(classifyEmail({ from, subject, body: subject, filenames: [] })).toBe("receipt");
    });
  }
  it("still rejects a newsletter that says 'receipt'", () => {
    expect(classifyEmail({
      from: "BetaList <team@betalist.com>",
      subject: "Weekly digest: 5 new startup deals",
      body: "unsubscribe anytime",
      filenames: [],
    })).toBe("none");
  });
  it("still rejects a marketing blast from a non-merchant", () => {
    expect(classifyEmail({
      from: "Jobgurus Nigeria <jobs@jobgurusnigeria.com>",
      subject: "Your order confirmation receipt attached",
      body: "receipt receipt receipt",
      filenames: [],
    })).toBe("none");
  });
  it("subject sweep now covers subscription wording", () => {
    const q = gmailQueries(new Date("2026-01-01")).join(" ");
    for (const term of ["subscription", "renewed", "renewal", "membership", "order confirmation", "payment received"]) {
      expect(q).toContain(term);
    }
  });
});
