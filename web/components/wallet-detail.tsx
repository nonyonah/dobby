"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { Segmented } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BreakdownPie, type BreakdownItem } from "@/components/breakdown-pie";
import { FlowTable } from "@/components/flow-table";
import { ChainLogo, chainLabel } from "@/components/ui/chain-logo";
import { WalletIcon } from "@/components/icons";
import { useApi } from "@/hooks/use-api";
import { AGGREGATE_TIMEOUT_MS } from "@/lib/api-client";
import { formatCurrency, formatUSD, getAppCurrency } from "@/lib/format";
import { fetchWalletSummary } from "@/lib/wallet-summary";
import type { TxFull } from "@/lib/transactions";

/**
 * One connected wallet, reached by clicking its row in the AI sidebar's
 * Connected accounts tree. There is deliberately no nav entry for it: a wallet
 * is something you already connected, so the sidebar list is the index and
 * this is the detail behind one of its rows.
 *
 * It mirrors the Insights stablecoin tab — two stat cards, a donut, a table —
 * but on a live snapshot instead of a month. Balances come from one net-worth
 * read (the API proxies the chain provider) and the activity rows come from the
 * wallet's own summary, which is per-address.
 *
 * Bank accounts is the same structure with the asset donut swapped for a
 * statement breakdown, because an account is acted on by statement rather than
 * by asset. It ships disabled: the structure exists, the statement pipeline
 * does not.
 */

type Tab = "wallet" | "accounts";

type WalletSummary = {
  id: string;
  displayName: string;
  chain: "BASE" | "SOLANA";
  address: string;
  status: "ok" | "provider_unconfigured" | "error";
  detail?: string;
};

type NetWorthSnapshot = {
  totalUsd: number;
  unpricedCount: number;
  holdings: Array<{ walletId: string; symbol: string; amount: number; usdValue: number | null }>;
  accounts: Array<{ id: string; name: string; currency: string; balance: number; balanceUsd: number | null }>;
  wallets: WalletSummary[];
};

type Transfer = { hash?: string; from?: string; to?: string; value?: number | string | null; asset?: string | null };

/** Stablecoin colours reused from the Insights stablecoin tab so an asset reads the same on both pages. */
const ASSET_COLORS: Record<string, string> = {
  USDC: "#2775ca",
  USDT: "#26a17b",
  CNGN: "#7c3aed",
  ETH: "#627eea",
  SOL: "#14f195",
};

/** Deterministic hue for an asset the palette has no entry for. */
function colorFor(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (ASSET_COLORS[upper]) return ASSET_COLORS[upper];
  let hash = 0;
  for (const char of upper) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 62% 52%)`;
}

function shortAddress(address: string): string {
  if (!address || address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: string }) {
  return (
    <Card className="gap-1 p-4 sm:p-5">
      <p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mono m-0 text-[28px] font-semibold tracking-[-0.02em] text-foreground tabular-nums sm:text-[32px]">{value}</p>
      <p className="m-0 mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        {accent ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} /> : null}
        <span className="truncate">{hint}</span>
      </p>
    </Card>
  );
}

/**
 * On-chain transfers are not ledger rows: they have no category and no tax
 * treatment, so mapping them into TxFull would invent one. They are shaped just
 * far enough to reuse FlowTable, with the direction this wallet saw them.
 */
function transferRows(transfers: Transfer[] | undefined, address: string): TxFull[] {
  return (transfers ?? []).map((transfer, index) => {
    const self = (address ?? "").toLowerCase();
    const incoming = (transfer.to ?? "").toLowerCase() === self;
    const value = Math.abs(Number(transfer.value ?? 0));
    const counterparty = shortAddress(incoming ? transfer.from ?? "" : transfer.to ?? "");
    return {
      id: transfer.hash ?? `transfer-${index}`,
      name: counterparty ? `${incoming ? "Received from" : "Sent to"} ${counterparty}` : "Transfer",
      account: transfer.asset ?? "—",
      date: "",
      amount: incoming ? value : -value,
      category: "transfer",
      taxable: false,
      source: "wallet" as const,
      parse: { state: "manual" as const },
      note: "",
    };
  });
}

export default function WalletDetailView({ walletId }: { walletId: string }) {
  const api = useApi();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [tab, setTab] = useState<Tab>("wallet");
  const [snapshot, setSnapshot] = useState<NetWorthSnapshot | null>(null);
  const [balancesFailed, setBalancesFailed] = useState(false);
  // Which wallet the current read belongs to. Deriving `loading` from this
  // instead of resetting a boolean is what lets the effect re-run for a new
  // wallet without a synchronous setState in its body.
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const [display, setDisplay] = useState<{ amount: number; currency: string } | null>(null);
  const loading = settledFor !== walletId;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void api
      .get<{ data: NetWorthSnapshot }>("/v1/insights/net-worth", { timeoutMs: AGGREGATE_TIMEOUT_MS })
      .then((response) => {
        if (cancelled) return;
        setSnapshot(response.data);
        setBalancesFailed(false);
        // This wallet's priced holdings. Converted here rather than in an effect
        // of its own so every setState stays inside a callback — a synchronous
        // set in an effect body re-renders before paint.
        const held = response.data.holdings
          .filter((holding) => holding.walletId === walletId && holding.usdValue !== null)
          .reduce((sum, holding) => sum + (holding.usdValue ?? 0), 0);
        const target = getAppCurrency();
        if (target === "USD") {
          setDisplay({ amount: held, currency: "USD" });
          return;
        }
        void api
          .get<{ data: { convertedAmount: number } }>(
            `/v1/currency/convert?amount=${encodeURIComponent(held)}&from=USD&to=${encodeURIComponent(target)}`,
          )
          .then((conversion) => {
            if (!cancelled) setDisplay({ amount: conversion.data.convertedAmount, currency: target });
          })
          .catch(() => {
            if (!cancelled) setDisplay({ amount: held, currency: "USD" });
          });
      })
      .catch(() => {
        if (!cancelled) setBalancesFailed(true);
      })
      .finally(() => {
        if (!cancelled) setSettledFor(walletId);
      });
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, walletId]);

  // Keyed by wallet id rather than reset with a synchronous setState, so
  // switching wallets re-enters the loading state without a cascading render.
  const [summary, setSummary] = useState<{ id: string; transfers?: Transfer[] } | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void fetchWalletSummary<{ chain: string; address: string; transfers?: Transfer[] }>(api, walletId)
      .then((result) => {
        if (!cancelled) setSummary({ id: walletId, transfers: result?.transfers });
      })
      .catch(() => {
        if (!cancelled) setSummary({ id: walletId, transfers: undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn, walletId]);

  const transfers = summary?.id === walletId ? summary.transfers : undefined;
  const summaryState = summary?.id !== walletId ? "loading" : transfers ? "ready" : "failed";

  const wallet = useMemo(() => snapshot?.wallets.find((item) => item.id === walletId) ?? null, [snapshot, walletId]);

  // Only priced holdings count: an unpriced token has no honest share of a
  // total to draw, so it is reported separately instead of inside the donut.
  const assets = useMemo<BreakdownItem[]>(() => {
    const totals = new Map<string, number>();
    for (const holding of snapshot?.holdings ?? []) {
      if (holding.walletId !== walletId || holding.usdValue === null) continue;
      const symbol = holding.symbol.toUpperCase();
      totals.set(symbol, (totals.get(symbol) ?? 0) + holding.usdValue);
    }
    return [...totals.entries()]
      .map(([symbol, amount]) => ({ id: symbol, name: symbol, amount, color: colorFor(symbol) }))
      .sort((left, right) => right.amount - left.amount);
  }, [snapshot, walletId]);

  const heldUsd = assets.reduce((sum, item) => sum + item.amount, 0);

  const rows = useMemo(() => transferRows(transfers, wallet?.address ?? ""), [transfers, wallet?.address]);

  // The sidebar only lists wallets the user connected, so a missing one means
  // the id is stale (deleted, or from another account).
  const missing = !loading && !balancesFailed && snapshot !== null && wallet === null;

  return (
    <Shell title={wallet?.displayName ?? "Wallet"} active="transactions">
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {missing ? (
          <Card className="p-0">
            <EmptyState
              title="Wallet no longer connected"
              suggestion="It may have been removed from Settings. Connect it again to bring its balances and activity back here."
              action={{
                label: "Manage connections",
                onClick: () => router.push("/settings"),
              }}
            />
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                label="Account type"
                value={tab}
                onValueChange={(value) => setTab(value as Tab)}
                options={[
                  { value: "wallet", label: "Wallet" },
                  // Built and intentionally switched off until statement
                  // review ships — the design is ready, the data is not.
                  { value: "accounts", label: "Bank accounts", disabled: true },
                ]}
              />
              <Button variant="secondary" size="small" onClick={() => router.push("/settings")}>
                Manage connections
              </Button>
            </div>

            {tab === "accounts" ? (
              <AccountsTab accounts={snapshot?.accounts ?? []} loading={loading} />
            ) : (
              <>
                {wallet ? (
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <WalletIcon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[15px] font-semibold text-foreground">{wallet.displayName}</span>
                        <ChainLogo
                          chain={wallet.chain}
                          className="block size-3.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/10"
                        />
                      </span>
                      <span className="mono block truncate text-[12px] text-muted-foreground">
                        {chainLabel(wallet.chain)} · {wallet.address}
                      </span>
                    </span>
                    {wallet.status !== "ok" ? (
                      <span
                        className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${wallet.status === "provider_unconfigured" ? "bg-warning-soft text-warning" : "bg-destructive-soft text-destructive"}`}
                      >
                        {wallet.status === "provider_unconfigured" ? "Provider not configured" : "Lookup failed"}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {/* Two cards: what this wallet holds, and in how many assets. */}
                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                  <StatCard
                    label="Total holdings"
                    value={formatCurrency(display?.amount ?? 0, display?.currency ?? "USD")}
                    hint={loading ? "Reading balances…" : wallet?.status === "ok" ? "Live balance" : "Balance unavailable"}
                  />
                  <StatCard
                    label="Assets"
                    value={String(assets.length)}
                    hint={
                      assets.length > 0
                        ? assets.slice(0, 3).map((item) => item.name).join(" · ") + (assets.length > 3 ? ` +${assets.length - 3}` : "")
                        : "Nothing priced yet"
                    }
                    accent={assets[0]?.color}
                  />
                </div>

                <BreakdownPie title="Holdings by asset" items={assets} filterLabel="All assets" />

                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    {summaryState === "loading" ? (
                      <div className="mb-2 rounded-md bg-secondary px-3 py-2 text-[12px] text-muted-foreground" role="status">
                        Loading on-chain activity…
                      </div>
                    ) : null}
                    <FlowTable title="Recent activity" typeLabel="On-chain" filterLabel={chainLabel(wallet?.chain ?? "BASE")} rows={rows} signed />
                  </div>

                  <Card className="gap-0 p-0">
                    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Asset detail</span>
                      <span className="rounded-full border border-line bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {assets.length}
                      </span>
                    </div>
                    <ul className="m-0 list-none p-0">
                      {assets.map((asset) => {
                        const share = heldUsd > 0 ? (asset.amount / heldUsd) * 100 : 0;
                        return (
                          <li key={asset.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: asset.color }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-foreground">{asset.name}</span>
                              <span className="block text-[11px] text-muted-foreground">{share.toFixed(0)}% of holdings</span>
                            </span>
                            <span className="mono shrink-0 text-[13px] font-medium text-foreground tabular-nums">{formatUSD(asset.amount)}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {assets.length === 0 && !loading ? (
                      <p className="m-0 px-4 py-6 text-center text-[13px] text-muted-foreground">
                        No priced assets in this wallet.
                      </p>
                    ) : null}
                  </Card>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

/**
 * Bank accounts: the wallets structure with the asset donut swapped for a
 * statement breakdown, since an account is triaged by statement rather than by
 * asset. Kept reachable in code so the two can be compared before the statement
 * pipeline exists, but the tab that would open it ships disabled.
 */
function AccountsTab({ accounts, loading }: { accounts: NetWorthSnapshot["accounts"]; loading: boolean }) {
  const real = accounts.filter((account) => !account.id.startsWith("unassigned-"));
  const unassigned = accounts.filter((account) => account.id.startsWith("unassigned-"));

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <StatCard
          label="Total across accounts"
          value={formatUSD(accounts.reduce((sum, account) => sum + (account.balanceUsd ?? 0), 0))}
          hint={`${real.length} account${real.length === 1 ? "" : "s"}`}
        />
        <StatCard label="Statements" value="0" hint="Statement processing hasn&apos;t shipped yet" />
      </div>

      <Card className="gap-0 p-0">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Statements by status</span>
          <span className="rounded-full border border-line bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Processed / Needs review
          </span>
        </div>
        <ul className="m-0 list-none p-0">
          <li className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <span className="text-[13px] text-foreground">Processed</span>
            <span className="text-[13px] text-muted-foreground">Nothing imported yet</span>
          </li>
          <li className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <span className="text-[13px] text-foreground">Needs review</span>
            <span className="text-[13px] text-muted-foreground">Nothing to review</span>
          </li>
          {real.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0">
              <span className="min-w-0 truncate text-[13px] text-foreground">{account.name}</span>
              <span className="mono shrink-0 text-[13px] text-muted-foreground tabular-nums">
                {formatCurrency(account.balance, account.currency)}
              </span>
            </li>
          ))}
          {unassigned.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-b-0">
              <span className="min-w-0 truncate text-[13px] text-foreground">{account.name}</span>
              <span className="mono shrink-0 text-[13px] text-muted-foreground tabular-nums">
                {formatCurrency(account.balance, account.currency)}
              </span>
            </li>
          ))}
        </ul>
        {loading ? (
          <div className="px-4 py-4 text-[12px] text-muted-foreground" role="status">
            Loading account balances…
          </div>
        ) : null}
      </Card>
    </>
  );
}
