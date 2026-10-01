import { describe, expect, it } from "vitest";
import { chunkStatementText, estimateTokens, isPayloadTooLarge } from "./gemini.js";

describe("statement chunking", () => {
  it("keeps every request inside the 7000 ITPM budget", () => {
    // 30,000 chars is what used to be sent as one request (~7,900 tokens).
    const text = Array.from({ length: 1200 }, (_, i) =>
      `12/03/2026  POS PURCHASE  AMAZON MKTPLACE  ${(i + 1).toFixed(2)}  1,234.56  5,678.90`,
    ).join("\n");
    expect(estimateTokens(text)).toBeGreaterThan(7000);
    const chunks = chunkStatementText(text);
    for (const chunk of chunks) {
      expect(estimateTokens(chunk)).toBeLessThan(2000);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("never splits a transaction row", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i} amount ${i}.00 balance ${i * 2}.00`);
    const text = lines.join("\n");
    const rejoined = chunkStatementText(text).join("\n").split("\n").sort();
    expect(rejoined).toEqual(lines.sort());
  });

  it("keeps an over-long single line rather than looping forever", () => {
    const text = "x".repeat(40_000);
    const chunks = chunkStatementText(text, 8000);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("").length).toBe(40_000);
  });

  it("returns nothing for empty text", () => {
    expect(chunkStatementText("   ")).toEqual([]);
  });

  it("tells an oversized payload apart from a busy provider", () => {
    expect(isPayloadTooLarge(new Error("Request too large ... ITPM: Limit 7000, Requested 7862"))).toBe(true);
    expect(isPayloadTooLarge(new Error("reduce your message size"))).toBe(true);
    expect(isPayloadTooLarge(new Error("Rate limit reached for requests"))).toBe(false);
    expect(isPayloadTooLarge(new Error("HTTP 503 upstream"))).toBe(false);
  });
});
