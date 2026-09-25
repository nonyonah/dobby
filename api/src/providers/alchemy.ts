import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";

export type BaseAssetTransfer = { hash: string; from: string; to: string; value?: number; asset?: string; rawContract?: { address?: string } };

export async function getBaseWalletTransfers(address: string, category: "from" | "to" | "fromAndTo" = "fromAndTo") {
  if (!env.ALCHEMY_BASE_API_URL || !env.ALCHEMY_API_KEY) throw new AppError(503, "Alchemy Base is not configured.", "ALCHEMY_NOT_CONFIGURED");
  const response = await fetch(env.ALCHEMY_BASE_API_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers", params: [{ fromBlock: "0x0", toBlock: "latest", fromAddress: category === "to" ? undefined : address, toAddress: category === "from" ? undefined : address, category: ["external", "erc20", "erc721", "erc1155"], withMetadata: true, maxCount: "0x64" }] }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new AppError(502, "Alchemy failed to return wallet activity.", "ALCHEMY_UPSTREAM_ERROR");
  const payload = await response.json() as { error?: { message?: string }; result?: { transfers?: BaseAssetTransfer[] } };
  if (payload.error) throw new AppError(502, payload.error.message ?? "Alchemy request failed.", "ALCHEMY_UPSTREAM_ERROR");
  return payload.result?.transfers ?? [];
}

type JsonRpcResponse<T> = { error?: { message?: string }; result?: T };

async function alchemyRpc<T>(method: string, params: unknown[]): Promise<T> {
  if (!env.ALCHEMY_BASE_API_URL || !env.ALCHEMY_API_KEY) throw new AppError(503, "Alchemy Base is not configured.", "ALCHEMY_NOT_CONFIGURED");
  const response = await fetch(env.ALCHEMY_BASE_API_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new AppError(502, "Alchemy failed to return wallet balances.", "ALCHEMY_UPSTREAM_ERROR");
  const payload = await response.json() as JsonRpcResponse<T>;
  if (payload.error) throw new AppError(502, payload.error.message ?? "Alchemy request failed.", "ALCHEMY_UPSTREAM_ERROR");
  if (payload.result === undefined) throw new AppError(502, "Alchemy returned no balance data.", "ALCHEMY_UPSTREAM_ERROR");
  return payload.result;
}

/** Convert a raw integer balance (hex `0x…` or decimal) into whole units. */
function rawToAmount(raw: string, decimals: number): number {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  return Number(value / base) + Number(value % base) / Number(base);
}

export type WalletBalance = { symbol: string; amount: number; address?: string };

/**
 * Native ETH plus every non-zero ERC-20 balance for a Base address, resolved
 * through Alchemy. Token metadata is fetched per contract, capped so a wallet
 * holding thousands of spam tokens cannot stall the request.
 */
export async function getBaseWalletBalances(address: string): Promise<WalletBalance[]> {
  const [native, tokenBalances] = await Promise.all([
    alchemyRpc<string>("eth_getBalance", [address, "latest"]),
    alchemyRpc<{ tokenBalances?: Array<{ contractAddress: string; tokenBalance: string | null }> }>("alchemy_getTokenBalances", [address, "erc20"]),
  ]);

  const balances: WalletBalance[] = [{ symbol: "ETH", amount: rawToAmount(native, 18) }];
  const nonZero = (tokenBalances.tokenBalances ?? [])
    .filter((token) => token.tokenBalance && /^0x[0-9a-fA-F]+$/.test(token.tokenBalance) && BigInt(token.tokenBalance) > 0n)
    .slice(0, 30);

  const resolved = await Promise.all(nonZero.map(async (token) => {
    try {
      const meta = await alchemyRpc<{ symbol?: string; decimals?: number }>("alchemy_getTokenMetadata", [token.contractAddress]);
      if (!meta.symbol || !token.tokenBalance) return null;
      return { symbol: meta.symbol.toUpperCase(), amount: rawToAmount(token.tokenBalance, meta.decimals ?? 18), address: token.contractAddress };
    } catch {
      return null;
    }
  }));
  for (const balance of resolved) if (balance) balances.push(balance);
  return balances;
}
