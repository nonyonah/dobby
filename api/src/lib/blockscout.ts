import { AppError } from "../middleware/errors.js";
import type { Chain } from "@prisma/client";
import { env } from "../config/env.js";

const blockscoutUrls: Partial<Record<Chain, string | undefined>> = {
  BASE: env.BLOCKSCOUT_BASE_API_URL,
  SOLANA: env.BLOCKSCOUT_SOLANA_API_URL,
};

export type BlockscoutAddressSummary = {
  chain: Chain;
  address: string;
  data: unknown;
};

export async function getBlockscoutAddressSummary(
  chain: Chain,
  address: string,
): Promise<BlockscoutAddressSummary> {
  const baseUrl = blockscoutUrls[chain];
  if (!baseUrl) {
    throw new AppError(503, `Blockscout is not configured for ${chain}.`, "BLOCKSCOUT_NOT_CONFIGURED");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/addresses/${encodeURIComponent(address)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new AppError(404, "Wallet address was not found by the configured Blockscout instance.", "WALLET_NOT_FOUND");
    }
    throw new AppError(502, "Blockscout failed to return wallet data.", "BLOCKSCOUT_UPSTREAM_ERROR");
  }

  return { chain, address, data: await response.json() };
}

type BlockscoutTokenRow = { token?: { address?: string; symbol?: string; decimals?: number }; value?: string };

function rawToAmount(raw: string, decimals: number): number {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  return Number(value / base) + Number(value % base) / Number(base);
}

/**
 * Native balance plus token balances for an address, from the configured
 * Blockscout instance for that chain. Used when Alchemy is not available
 * (and for Solana, which Alchemy does not cover here).
 */
export async function getBlockscoutBalances(chain: Chain, address: string): Promise<Array<{ symbol: string; amount: number; address?: string }>> {
  const baseUrl = blockscoutUrls[chain];
  if (!baseUrl) throw new AppError(503, `Blockscout is not configured for ${chain}.`, "BLOCKSCOUT_NOT_CONFIGURED");

  const summary = await getBlockscoutAddressSummary(chain, address);
  const record = (summary.data ?? {}) as Record<string, unknown>;
  const nativeSymbol = chain === "SOLANA" ? "SOL" : "ETH";
  const nativeDecimals = chain === "SOLANA" ? 9 : 18;
  const balances: Array<{ symbol: string; amount: number; address?: string }> = [];
  const nativeRaw = typeof record.coin_balance === "string" ? record.coin_balance : null;
  if (nativeRaw && /^\d+$/.test(nativeRaw)) balances.push({ symbol: nativeSymbol, amount: rawToAmount(nativeRaw, nativeDecimals) });

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/addresses/${encodeURIComponent(address)}/token-balances`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const payload = await response.json();
      const rows: BlockscoutTokenRow[] = Array.isArray(payload) ? payload : [];
      for (const row of rows.slice(0, 30)) {
        const symbol = row.token?.symbol;
        if (!symbol || !row.value || !/^\d+$/.test(row.value)) continue;
        balances.push({ symbol: symbol.toUpperCase(), amount: rawToAmount(row.value, Number.isInteger(row.token?.decimals) ? row.token!.decimals! : 18), address: row.token?.address });
      }
    }
  } catch {
    // Token list is best-effort: a native-only snapshot still counts.
  }
  return balances;
}
