import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wallet history was silently capped at about a week.
 *
 * `alchemy_getAssetTransfers` answers newest-first with a per-request cap, and
 * the reader walked backwards in block windows, stopping at the first window
 * that came back short of the page cap. For block windows that reasoning is
 * wrong — "this page wasn't full" says nothing about the window before it — and
 * because a normal wallet has only a handful of transfers per week of Base, the
 * walk stopped after the first one. Users scrolled back and found nothing older
 * than a few days, on every chain.
 *
 * The Solana reader had three faults stacked on top of that: `fromAddress` and
 * `toAddress` were sent together (Alchemy ANDs them, so it only ever matched
 * self-transfers), the response mapping dropped `metadata`, so no transfer
 * carried a timestamp, and it made a single unpaginated call.
 *
 * These are the two behaviours that produced the bug, tested through the
 * public functions with the transport stubbed. No network, no API key.
 */

// This file walks pagination loops, so it does more work than a typical unit
// test. Under a parallel full-suite run it was intermittently exceeding the
// default 5s and reporting a failure that had nothing to do with the assertion.
vi.setConfig({ testTimeout: 30_000 });

const BASE_URL = "https://base-mainnet.example/v2/test";
const SOLANA_URL = "https://solana-mainnet.example/v2/test";
const ADDRESS = "0xAbC0000000000000000000000000000000000001";

/** One `alchemy_getAssetTransfers` page, with an optional continuation cursor. */
function page(transfers: unknown[], pageKey?: string) {
  return { transfers, ...(pageKey ? { pageKey } : {}) };
}

/** Collects the params of every `getAssetTransfers` call made. */
let calls: Array<Record<string, unknown>> = [];

function stubTransport(handlers: { base?: (params: Record<string, unknown>) => unknown; solana?: (params: Record<string, unknown>) => unknown }) {
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method: string; params: Array<Record<string, unknown>> };
    const params = body.params[0] ?? {};
    calls.push(params);
    const isSolana = String(url).includes("solana");
    const handler = isSolana ? handlers.solana : handlers.base;
    const result = handler ? handler(params) : page([]);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200, headers: { "content-type": "application/json" } });
  });
}

const transfer = (overrides: Record<string, unknown> = {}) => ({
  hash: "0xhash1",
  from: ADDRESS,
  to: "0xdef",
  value: 100,
  asset: "USDC",
  rawContract: { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
  metadata: { blockTimestamp: 1_700_000_000, blockNum: "0x1" },
  ...overrides,
});

beforeEach(async () => {
  calls = [];
  vi.resetModules();
  process.env.ALCHEMY_BASE_API_URL = BASE_URL;
  process.env.ALCHEMY_SOLANA_API_URL = SOLANA_URL;
  process.env.ALCHEMY_API_KEY = "test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ALCHEMY_BASE_API_URL;
  delete process.env.ALCHEMY_SOLANA_API_URL;
  delete process.env.ALCHEMY_API_KEY;
});

describe("base wallet history", () => {
  it("keeps paging past a short page instead of stopping at the first window", async () => {
    // The bug: one transfer, then a pageKey, then more. Stopping on the short
    // first page is what truncated history to a week.
    stubTransport({
      // Distinct timestamps: with equal ones the sort is stable and the ordering
      // assertion below would pass or fail for the wrong reason.
      base: (params) =>
        params.pageKey
          ? page([transfer({ hash: "0xhash2", metadata: { blockTimestamp: 1_700_000_900 } })])
          : page([transfer({ hash: "0xhash1", metadata: { blockTimestamp: 1_700_000_000 } })], "cursor-1"),
    });
    const { getBaseWalletTransfers } = await import("./alchemy.js");
    const transfers = await getBaseWalletTransfers(ADDRESS);

    expect(transfers.map((item) => item.hash)).toEqual(["0xhash2", "0xhash1"]);
    expect(calls.length).toBeGreaterThan(1);
  });

  it("stops when the upstream stops returning a cursor", async () => {
    stubTransport({ base: () => page([transfer()]) });
    const { getBaseWalletTransfers } = await import("./alchemy.js");
    const transfers = await getBaseWalletTransfers(ADDRESS);

    expect(transfers).toHaveLength(1);
    // One short page, no cursor: one request per direction, not a fixed budget.
    expect(calls).toHaveLength(2);
  });

  it("does not narrow the query with both directions at once", async () => {
    stubTransport({ base: () => page([]) });
    const { getBaseWalletTransfers } = await import("./alchemy.js");
    await getBaseWalletTransfers(ADDRESS);

    for (const call of calls) {
      const both = call.fromAddress !== undefined && call.toAddress !== undefined;
      expect(both, "Alchemy ANDs fromAddress with toAddress, which matches only self-transfers").toBe(false);
    }
  });

  it("merges the two directions without duplicating a movement written in two casings", async () => {
    stubTransport({
      base: (params) =>
        params.fromAddress !== undefined
          ? page([transfer({ from: ADDRESS.toLowerCase() })])
          : page([transfer({ from: ADDRESS.toLowerCase() })]),
    });
    const { getBaseWalletTransfers } = await import("./alchemy.js");
    const transfers = await getBaseWalletTransfers(ADDRESS);

    expect(transfers).toHaveLength(1);
  });
});

describe("solana wallet history", () => {
  const solanaTransfer = (overrides: Record<string, unknown> = {}) => ({
    signature: "sig1",
    from: "So11111111111111111111111111111111111111112",
    to: "Recipient1111111111111111111111111111111111111",
    value: 25,
    asset: "USDT",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    metadata: { blockTimestamp: 1_700_000_000 },
    ...overrides,
  });

  it("keeps the timestamp the mapping used to drop", async () => {
    // Without this no transfer can be placed in a tax period, and every
    // on-chain movement was skipped as unplaceable.
    stubTransport({ solana: () => page([solanaTransfer()]) });
    const { getSolanaWalletTransfers } = await import("./alchemy.js");
    const [first] = await getSolanaWalletTransfers("WalletAddress1111");

    expect(first?.metadata?.blockTimestamp).toBe(1_700_000_000);
    expect(first?.rawContract?.address).toBe("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
  });

  it("does not narrow the query with both directions at once", async () => {
    stubTransport({ solana: () => page([]) });
    const { getSolanaWalletTransfers } = await import("./alchemy.js");
    await getSolanaWalletTransfers("WalletAddress1111");

    for (const call of calls) {
      expect(call.fromAddress !== undefined && call.toAddress !== undefined).toBe(false);
    }
    expect(calls).toHaveLength(2);
  });

  it("pages backwards with the cursor instead of one capped call", async () => {
    // The upstream hands back its own `pageKey` first; the signature is only a
    // fallback for a response that carries no key. Both paths must page.
    stubTransport({
      solana: (params) => {
        if (params.pageKey || params.before) return page([solanaTransfer({ signature: "sig3", metadata: { blockTimestamp: 1_700_000_900 } })]);
        return page([solanaTransfer({ metadata: { blockTimestamp: 1_700_000_000 } })], "sig1");
      },
    });
    const { getSolanaWalletTransfers } = await import("./alchemy.js");
    const transfers = await getSolanaWalletTransfers("WalletAddress1111");

    expect(transfers.map((item) => item.hash)).toEqual(["sig3", "sig1"]);
    // More than one page per direction, and a cursor actually sent upstream.
    expect(calls.length).toBeGreaterThan(2);
    expect(calls.some((call) => call.pageKey !== undefined || call.before !== undefined)).toBe(true);
  });

  it("asks for no NFT category, which used to fill the page before any token transfer", async () => {
    stubTransport({ solana: () => page([]) });
    const { getSolanaWalletTransfers } = await import("./alchemy.js");
    await getSolanaWalletTransfers("WalletAddress1111");

    for (const call of calls) {
      expect(call.category).not.toContain("nft");
    }
  });
});