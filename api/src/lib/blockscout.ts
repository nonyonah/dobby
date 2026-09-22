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
