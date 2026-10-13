import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";
import { logger } from "../lib/logger.js";

export type BaseAssetTransfer = {
  hash: string;
  from: string;
  to: string;
  value?: number;
  asset?: string;
  rawContract?: { address?: string };
  /** Present because every call requests it, and the backfill dates by it. */
  /**
   * `blockTimestamp` is typed `number` because that is what it usually is, but
   * the provider sends it as a decimal or hex string on some responses. Both
   * consumers got this wrong in opposite directions — the browser crashed on
   * `.toISOString`, the importer skipped the row outright — so the type now
   * admits what actually arrives.
   */
  metadata?: { blockTimestamp?: number | string; blockNum?: string };
};
export type WalletBalance = { symbol: string; amount: number; address?: string };

/** Endpoint per chain, or undefined when that chain has no Alchemy key wired. */
const alchemyUrlFor = (chain: "base" | "solana") => {
  if (!env.ALCHEMY_API_KEY) return undefined;
  return chain === "base" ? env.ALCHEMY_BASE_API_URL : env.ALCHEMY_SOLANA_API_URL;
};

const chainLabel = (chain: "base" | "solana") => (chain === "base" ? "Base" : "Solana");

export function alchemyConfigured(chain: "base" | "solana"): boolean {
  return Boolean(alchemyUrlFor(chain));
}

type JsonRpcResponse<T> = { error?: { message?: string }; result?: T };

async function alchemyRpc<T>(chain: "base" | "solana", method: string, params: unknown[], label: string): Promise<T> {
  const url = alchemyUrlFor(chain);
  if (!url) throw new AppError(503, `Alchemy ${chainLabel(chain)} is not configured.`, "ALCHEMY_NOT_CONFIGURED");
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  // 401/403 mean the key is wrong or the network is not enabled for the app —
  // a configuration gap, not a provider outage, so surface it as such rather
  // than as a 502 the UI renders as a hard error.
  if (response.status === 401 || response.status === 403) {
    throw new AppError(503, `Alchemy ${chainLabel(chain)} is not enabled for this app.`, "ALCHEMY_NOT_CONFIGURED");
  }
  if (!response.ok) throw new AppError(502, `Alchemy failed to return ${label}.`, "ALCHEMY_UPSTREAM_ERROR");
  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) throw new AppError(502, payload.error.message ?? "Alchemy request failed.", "ALCHEMY_UPSTREAM_ERROR");
  if (payload.result === undefined) throw new AppError(502, `Alchemy returned no ${label}.`, "ALCHEMY_UPSTREAM_ERROR");
  return payload.result;
}

/** Convert a raw integer balance (hex `0x…`, decimal, or `0x`-less base64 solana amount) into whole units. */
function rawToAmount(raw: string, decimals: number): number {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  return Number(value / base) + Number(value % base) / Number(base);
}

/**
 * How far back a wallet sync reaches, and how it gets there.
 *
 * `maxCount` is a per-request cap, and `alchemy_getAssetTransfers` answers
 * newest-first. Capping at 100 therefore meant any wallet with more than 100
 * transfers could never show anything older than its hundred most recent —
 * which on an active wallet is a matter of days, and is why imports from months
 * ago simply never arrived.
 *
 * So history now follows Alchemy's own `pageKey` cursor backwards from the
 * head, which is what actually signals "nothing older exists". An earlier
 * version windowed by block range and stopped at the first short page, which
 * for almost every wallet meant the very first window — about a week.
 */
const TRANSFERS_PER_PAGE = 0x3e8; // 1000, the documented maximum
/** Upper bound on cursor pages per direction, so a busy address still returns. */
const MAX_PAGES = 30;

export async function getBaseWalletTransfers(address: string, category: "from" | "to" | "fromAndTo" = "fromAndTo") {
  // Alchemy ANDs `fromAddress` with `toAddress`, so passing both is a request
  // for transfers from this address *to itself* — which is why asking for
  // everything a wallet did returned almost nothing. Incoming and outgoing are
  // two separate passes, merged afterwards.
  const filters =
    category === "from"
      ? [{ fromAddress: address, toAddress: undefined }]
      : category === "to"
        ? [{ fromAddress: undefined, toAddress: address }]
        : [{ fromAddress: address, toAddress: undefined }, { fromAddress: undefined, toAddress: address }];

  const merged = new Map<string, BaseAssetTransfer>();
  for (const filter of filters) {
    for (const transfer of await walkTransfers(filter)) {
      // `hash` alone is not unique: one transaction can carry several transfers,
      // which is what the ERC-721 and batch cases produce.
      // Lower-cased: Base addresses arrive checksum-cased from the RPC and
      // lower-cased from the wallet row, and a case-sensitive key turned one
      // movement into two rows.
      merged.set(
        `${transfer.hash}:${(transfer.rawContract?.address ?? "").toLowerCase()}:${transfer.value ?? ""}:${transfer.from?.toLowerCase() ?? ""}:${transfer.to?.toLowerCase() ?? ""}`,
        transfer,
      );
    }
  }

  return [...merged.values()].sort((a, b) => Number(b.metadata?.blockTimestamp ?? 0) - Number(a.metadata?.blockTimestamp ?? 0));
}

type TransferFilter = { fromAddress: string | undefined; toAddress: string | undefined };

/**
 * Walks a wallet's transfers backwards from the head.
 *
 * This used to window by block range and stopped as soon as a window came back
 * short of the 1000-transfer page cap. That reasoning does not hold for block
 * windows: a window spanning ~7 days of Base comes back with a handful of
 * transfers for almost any real wallet, so the walk stopped after the very
 * first window and users saw roughly a week of history no matter how far back
 * they scrolled. "This page wasn't full" only means the page wasn't full — it
 * says nothing about the window before it.
 *
 * Alchemy's own `pageKey` is the actual exhaustion signal: the upstream walks
 * backwards itself and hands back a cursor until there is nothing left. So this
 * follows `pageKey` from `latest` and stops when it stops being returned, which
 * is both correct and cheaper — one request per 1000 transfers rather than one
 * per block window whether or not anything was there.
 */
async function walkTransfers(filter: TransferFilter): Promise<BaseAssetTransfer[]> {
  const collected: BaseAssetTransfer[] = [];
  let pageKey: string | undefined;

  for (let page = 0; page < MAX_PAGES && collected.length < MAX_PAGES * TRANSFERS_PER_PAGE; page++) {
    let result: { transfers?: BaseAssetTransfer[]; pageKey?: string };
    try {
      result = await alchemyRpc<{ transfers?: BaseAssetTransfer[]; pageKey?: string }>(
        "base",
        "alchemy_getAssetTransfers",
        [
          {
            fromAddress: filter.fromAddress,
            toAddress: filter.toAddress,
            category: ["external", "erc20", "erc721", "erc1155"],
            withMetadata: true,
            maxCount: `0x${TRANSFERS_PER_PAGE.toString(16)}`,
            order: "asc",
            ...(pageKey ? { pageKey } : {}),
          },
        ],
        "wallet activity",
      );
    } catch (error) {
      // Older pages are the first thing to be rate-limited, and what was
      // already collected is still the most recent and most useful history.
      logger.warn({ filter, page, error: error instanceof Error ? error.message : String(error) }, "wallet history page failed; stopping");
      break;
    }
    collected.push(...(result.transfers ?? []));
    // No cursor back means the upstream has nothing older to give.
    if (!result.pageKey) break;
    pageKey = result.pageKey;
  }

  return collected;
}

/**
 * Native ETH plus every non-zero ERC-20 balance for a Base address, resolved
 * through Alchemy. Token metadata is fetched per contract, capped so a wallet
 * holding thousands of spam tokens cannot stall the request.
 */
export async function getBaseWalletBalances(address: string): Promise<WalletBalance[]> {
  const [native, tokenBalances] = await Promise.all([
    alchemyRpc<string>("base", "eth_getBalance", [address, "latest"], "wallet balances"),
    alchemyRpc<{ tokenBalances?: Array<{ contractAddress: string; tokenBalance: string | null }> }>("base", "alchemy_getTokenBalances", [address, "erc20"], "wallet balances"),
  ]);

  const balances: WalletBalance[] = [{ symbol: "ETH", amount: rawToAmount(native, 18) }];
  const nonZero = (tokenBalances.tokenBalances ?? [])
    .filter((token) => token.tokenBalance && /^0x[0-9a-fA-F]+$/.test(token.tokenBalance) && BigInt(token.tokenBalance) > 0n)
    .slice(0, 30);

  const resolved = await Promise.all(nonZero.map(async (token) => {
    try {
      const meta = await alchemyRpc<{ symbol?: string; decimals?: number }>("base", "alchemy_getTokenMetadata", [token.contractAddress], "token metadata");
      if (!meta.symbol || !token.tokenBalance) return null;
      return { symbol: meta.symbol.toUpperCase(), amount: rawToAmount(token.tokenBalance, meta.decimals ?? 18), address: token.contractAddress };
    } catch {
      return null;
    }
  }));
  for (const balance of resolved) if (balance) balances.push(balance);
  return balances;
}

/**
 * Solana transfer history for an address. Alchemy's Solana endpoint exposes the
 * Transfers API as `getAssetTransfers` with Solana-shaped categories (native
 * SOL and SPL tokens) rather than the EVM `external`/`erc20` set, so this
 * cannot reuse the Base call above.
 */
/**
 * A Solana wallet's transfers, oldest reachable history included.
 *
 * This was three bugs in one function, and together they produced an empty
 * history for every Solana user while looking like "no recent activity":
 *
 * 1. `fromAddress` and `toAddress` were sent together. Alchemy treats those as
 *    an AND, so the query only ever matched transfers where the wallet sent to
 *    itself — which is nothing. The Base path above already worked around this
 *    by running two separate filters and merging; this did not.
 * 2. The response mapping dropped `metadata`, so no transfer carried a
 *    timestamp. Anything that needs to place a movement in a tax period had
 *    nothing to work with.
 * 3. A single `maxCount: "0x64"` call with no pagination, so history stopped at
 *    the hundred most recent transfers.
 *
 * Solana has no block numbers to window over, so this pages by signature
 * instead: `before` the oldest signature already seen, until a short page says
 * the history is exhausted or the bound is hit.
 */
export async function getSolanaWalletTransfers(address: string): Promise<BaseAssetTransfer[]> {
  type SolanaTransfer = {
    hash?: string;
    signature?: string;
    from?: string;
    to?: string;
    value?: number;
    asset?: string;
    mint?: string;
    rawContract?: { address?: string };
    metadata?: { blockTimestamp?: number };
  };

  const fetchPage = async (filter: { fromAddress?: string; toAddress?: string }, cursor: { pageKey?: string; before?: string }) => {
    const result = await alchemyRpc<{ transfers?: SolanaTransfer[]; pageKey?: string }>(
      "solana",
      "getAssetTransfers",
      [
        {
          ...filter,
          // `external` and `erc20` only. The old list included `nft`, which
          // returned a page full of mint events and used the whole cap before
          // reaching any token transfer.
          category: ["external", "erc20"],
          withMetadata: true,
          maxCount: `0x${TRANSFERS_PER_PAGE.toString(16)}`,
          ...cursor,
        },
      ],
      "wallet activity",
    );
    return { transfers: result.transfers ?? [], pageKey: result.pageKey };
  };

  const toTransfer = (transfer: SolanaTransfer): BaseAssetTransfer => ({
    hash: transfer.hash ?? transfer.signature ?? "",
    from: transfer.from ?? "",
    to: transfer.to ?? "",
    value: transfer.value,
    asset: transfer.asset,
    rawContract: { address: transfer.mint ?? transfer.rawContract?.address },
    metadata: transfer.metadata,
  });

  const filters: Array<{ fromAddress?: string; toAddress?: string }> = [{ fromAddress: address }, { toAddress: address }];
  const merged = new Map<string, BaseAssetTransfer>();

  for (const filter of filters) {
    let cursor: { pageKey?: string; before?: string } = {};
    let collected = 0;
    for (let page = 0; page < MAX_PAGES && collected < MAX_PAGES * TRANSFERS_PER_PAGE; page++) {
      let result: { transfers: SolanaTransfer[]; pageKey?: string };
      try {
        result = await fetchPage(filter, cursor);
      } catch (error) {
        // Same contract as the Base walk: keep the history already gathered
        // rather than failing the whole read over one older page.
        logger.warn({ filter, page, error: error instanceof Error ? error.message : String(error) }, "solana history page failed; stopping");
        break;
      }
      for (const transfer of result.transfers) {
        const mapped = toTransfer(transfer);
        merged.set(
          `${mapped.hash}:${(mapped.rawContract?.address ?? "").toLowerCase()}:${mapped.value ?? ""}:${mapped.from?.toLowerCase() ?? ""}:${mapped.to?.toLowerCase() ?? ""}`,
          mapped,
        );
      }
      collected += result.transfers.length;

      // Continue while the upstream offers a cursor. A short page is *not* an
      // exhaustion signal: every real wallet's first page is short, so breaking
      // on length here is the same week-long history cap this reader had on
      // Base before it was fixed. Preference order matters — `pageKey` is the
      // upstream's own cursor, and the signature is a fallback for a response
      // that carries no key.
      if (result.pageKey) {
        cursor = { pageKey: result.pageKey };
        continue;
      }
      const last = result.transfers[result.transfers.length - 1];
      const before = last?.hash ?? last?.signature;
      if (!before || result.transfers.length === 0) break;
      cursor = { before };
    }
  }

  return [...merged.values()].sort((a, b) => Number(b.metadata?.blockTimestamp ?? 0) - Number(a.metadata?.blockTimestamp ?? 0));
}

/** How many SPL mints to resolve before we stop, so spam cannot stall a request. */
const SOLANA_TOKEN_CAP = 30;

/**
 * Native SOL plus non-zero SPL token balances for a Solana address.
 *
 * `getTokenBalances` is Alchemy's Solana-side DAS equivalent of the EVM token
 * API and returns `uiTokenAmount` already scaled to human units, so no metadata
 * round-trip is needed. Both that and the bare `getBalance` lamports reply are
 * handled, since Alchemy has shipped the pair under different shapes.
 */
export async function getSolanaWalletBalances(address: string): Promise<WalletBalance[]> {
  const native = await alchemyRpc<{ value?: number } | number>("solana", "getBalance", [address, { commitment: "confirmed" }], "wallet balances");
  const lamports = typeof native === "number" ? native : (native.value ?? 0);

  const balances: WalletBalance[] = [{ symbol: "SOL", amount: lamports / 1e9 }];

  let tokenResult: { value?: Array<{ mint?: string; uiTokenAmount?: { uiAmount?: number | null; amount?: string; decimals?: number } }> } | Array<Record<string, unknown>> | undefined;
  try {
    tokenResult = await alchemyRpc<typeof tokenResult>("solana", "getTokenBalances", [address, { commitment: "confirmed" }], "wallet balances");
  } catch {
    // A wallet with no SPL accounts, or a node that does not expose the DAS
    // method, should still report its native SOL balance.
    return balances;
  }

  const entries = Array.isArray(tokenResult) ? tokenResult : (tokenResult?.value ?? []);
  const nonZero = entries
    .map((entry) => {
      const mint = (entry as { mint?: string }).mint;
      const ui = (entry as { uiTokenAmount?: { uiAmount?: number | null } }).uiTokenAmount;
      if (!mint || !ui) return null;
      const amount = typeof ui.uiAmount === "number" ? ui.uiAmount : null;
      if (amount === null || amount <= 0) return null;
      return { mint, amount };
    })
    .filter((entry): entry is { mint: string; amount: number } => entry !== null)
    .slice(0, SOLANA_TOKEN_CAP);

  for (const token of nonZero) {
    const meta = await resolveSolanaTokenMeta(token.mint);
    balances.push({ symbol: meta.symbol, amount: token.amount, address: token.mint });
  }
  return balances;
}

/**
 * SPL mints carry no symbol, and only the two audited stablecoins in
 * STABLE_CONTRACTS carry value, so a known-mint table is enough. Unknown mints
 * are labelled by mint prefix rather than dropped: net worth shows them as
 * unpriced, which is the honest answer.
 */
const SOLANA_TOKEN_META: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

function resolveSolanaTokenMeta(mint: string): { symbol: string } {
  return { symbol: SOLANA_TOKEN_META[mint] ?? `SPL ${mint.slice(0, 4)}` };
}