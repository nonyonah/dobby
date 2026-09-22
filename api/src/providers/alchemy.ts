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
