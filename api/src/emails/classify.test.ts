import { describe, expect, it } from "vitest";
import { addressOf, matchBankSender, matchMerchant, type SenderDirectory } from "./bank-directory.js";
import { classifyEmail, gmailQueries } from "./classify.js";

const directory: SenderDirectory = {
  loadedAt: Date.now(),
  exact: new Map([["no-reply@kuda.com", { bank: "Kuda", verified: true }]]),
  domains: [{ domain: "gtbank.com", bank: "GTBank", verified: true }],
  merchantExact: new Map([["no-reply@spotify.com", { merchant: "Spotify", category: "subscriptions" }]]),
  merchantDomains: [],
  merchantSubjects: [],
};

describe("addressOf", () => {
  it("extracts the address from a display-name sender", () => {
    expect(addressOf("OPay <no-reply@opay-nigeria.com>")).toBe("no-reply@opay-nigeria.com");
  });
  it("lowercases bare addresses and rejects non-addresses", () => {
    expect(addressOf("No-Reply@Kuda.COM")).toBe("no-reply@kuda.com");
    expect(addressOf("Kuda Alerts")).toBeNull();
  });
});

describe("matchBankSender", () => {
  it("prefers exact addresses over domain suffixes", () => {
    expect(matchBankSender("Kuda <no-reply@kuda.com>", directory)).toEqual({ bank: "Kuda", verified: true });
  });
  it("matches domain suffixes including subdomains", () => {
    expect(matchBankSender("alerts@mail.gtbank.com", directory)?.bank).toBe("GTBank");
    expect(matchBankSender("alerts@gtbank.com.evil.com", directory)).toBeUndefined();
  });
});

describe("matchMerchant", () => {
  it("matches exact merchant senders", () => {
    expect(matchMerchant("Spotify <no-reply@spotify.com>", "Your receipt", directory)?.merchant).toBe("Spotify");
  });
});

describe("classifyEmail", () => {
  it("classifies a bank statement PDF by keywords", () => {
    expect(classifyEmail({
      subject: "Statement for OPay Account 8153324197",
      from: "OPay <no-reply@opay-nigeria.com>",
      filenames: ["statement.pdf"],
    })).toBe("statement");
  });
  it("classifies a statement attachment from a known bank sender without keywords", () => {
    expect(classifyEmail({
      subject: "Your document is ready",
      from: "alerts@gtbank.com",
      filenames: ["doc.pdf"],
      directory,
    })).toBe("statement");
  });
  it("skips newsletter images that used to become failing receipts", () => {
    expect(classifyEmail({
      subject: "This week's startups",
      from: "BetaList <team@betalist.com>",
      filenames: ["logo.png"],
    })).toBe("none");
  });
  it("classifies merchant receipts by keywords or sender", () => {
    expect(classifyEmail({
      subject: "Your order confirmation for Premium Individual",
      from: "Spotify <no-reply@spotify.com>",
      filenames: ["receipt.pdf"],
      directory,
    })).toBe("receipt");
  });
  it("classifies bank alerts without attachments", () => {
    expect(classifyEmail({
      subject: "Debit Alert",
      from: "alerts@gtbank.com",
      body: "Acct: ******2342 Amt: NGN1,440.00 DR Desc: POS purchase Avail Bal: NGN754.04",
      directory,
    })).toBe("alert");
  });
});

describe("gmailQueries", () => {
  it("uses epoch bounds and one pass per attachment family", () => {
    const since = new Date("2026-06-28T00:00:00Z");
    const until = new Date("2026-09-26T00:00:00Z");
    const queries = gmailQueries(since, until);
    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain(`after:${Math.floor(since.getTime() / 1000)}`);
    expect(queries[0]).toContain(`before:${Math.floor(until.getTime() / 1000)}`);
    expect(queries[0]).toContain("filename:pdf");
    expect(queries[1]).toContain("filename:csv");
    expect(queries[2]).toContain("subject:debited");
  });
});
