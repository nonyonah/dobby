import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";

export type BaseAssetTransfer = { hash: string; from: string; to: string; value?: number; asset?: string; rawContract?: { address?: string } };
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

export async function getBaseWalletTransfers(address: string, category: "from" | "to" | "fromAndTo" = "fromAndTo") {
  const result = await alchemyRpc<{ transfers?: BaseAssetTransfer[] }>(
    "base",
    "alchemy_getAssetTransfers",
    [{ fromBlock: "0x0", toBlock: "latest", fromAddress: category === "to" ? undefined : address, toAddress: category === "from" ? undefined : address, category: ["external", "erc20", "erc721", "erc1155"], withMetadata: true, maxCount: "0x64" }],
    "wallet activity",
  );
  return result.transfers ?? [];
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
export async function getSolanaWalletTransfers(address: string) {
  const result = await alchemyRpc<{
    transfers?: Array<{ hash?: string; signature?: string; from?: string; to?: string; value?: number; asset?: string; mint?: string; rawContract?: { address?: string } }>;
  }>(
    "solana",
    "getAssetTransfers",
    [{ fromAddress: address, toAddress: address, category: ["external", "nft", "erc20"], withMetadata: true, maxCount: "0x64" }],
    "wallet activity",
  );

  return (result.transfers ?? []).map((transfer) => ({
    hash: transfer.hash ?? transfer.signature ?? "",
    from: transfer.from ?? "",
    to: transfer.to ?? "",
    value: transfer.value,
    asset: transfer.asset,
    rawContract: { address: transfer.mint ?? transfer.rawContract?.address },
  })) satisfies BaseAssetTransfer[];
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