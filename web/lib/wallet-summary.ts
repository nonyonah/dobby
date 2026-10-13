import { AGGREGATE_TIMEOUT_MS } from "@/lib/api-client";
import { ALL_STABLE_SYMBOLS } from "@/lib/stablecoins";

export interface WalletSummaryPayload {
  chain: string;
  address: string;
  provider?: string;
  /**
   * Carries the timestamp and the full counterparty address, both of which the
   * wallet page needs and both of which used to be dropped at this boundary.
   * Without the timestamp every row on the wallet page rendered with a blank
   * date and no way to tell a recent transfer from an old one.
   */
  transfers?: Array<{
    asset?: string | null;
    value?: number | string | null;
    hash?: string | null;
    from?: string | null;
    to?: string | null;
    metadata?: { blockTimestamp?: number | null } | null;
  }>;
}

/** Only shown when every attempt fails — the UI renders this as a string. */
export const SUMMARY_UNAVAILABLE = "Summary unavailable";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wallet summaries are not stored: the API proxies Alchemy/Blockscout live on
 * every read. A cold provider call routinely blows past the 15s default
 * timeout, and because callers used to write the failure straight into state,
 * one slow response pinned "Summary unavailable" on that wallet until a full
 * remount. Retrying once with the aggregate timeout treats a transient timeout
 * as what it is instead of caching it as a permanent answer.
 */
export async function fetchWalletSummary<T extends WalletSummaryPayload>(
  api: { get: <R>(path: string, options?: { timeoutMs?: number }) => Promise<R> },
  walletId: string,
  attempts = 2,
): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await api.get<{ data: T }>(`/v1/wallets/${walletId}/summary`, { timeoutMs: AGGREGATE_TIMEOUT_MS });
      return response.data;
    } catch {
      if (attempt < attempts - 1) await sleep(400);
    }
  }
  return null;
}

/** Compact human-readable line describing what the wallet has moved. */
export function summarizeTransfers(transfers?: WalletSummaryPayload["transfers"]): string {
  if (!transfers || transfers.length === 0) return "No on-chain activity yet";
  const totals = new Map<string, number>();
  for (const transfer of transfers) {
    const asset = (transfer.asset ?? "UNKNOWN").toUpperCase();
    const value = Number(transfer.value ?? 0);
    if (!Number.isFinite(value)) continue;
    totals.set(asset, (totals.get(asset) ?? 0) + Math.abs(value));
  }
  // ETH was in this list, which is not a stablecoin: it summarised a volatile
  // asset next to pegged ones as though they were comparable.
  const stables = [...ALL_STABLE_SYMBOLS]
    .filter((asset) => totals.has(asset.toUpperCase()))
    .map((asset) => `${totals.get(asset.toUpperCase())?.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${asset}`);
  const parts = stables.length > 0 ? stables : [`${transfers.length} transfers`];
  return `${transfers.length} transfers · ${parts.slice(0, 2).join(" · ")}`;
}