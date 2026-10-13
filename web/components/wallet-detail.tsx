"use client";

import { colorForAsset, isNairaPeggedAsset } from "@/lib/stablecoins";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { BreakdownPie, type BreakdownItem } from "@/components/breakdown-pie";
import { FlowTable } from "@/components/flow-table";
import { ChainLogo, chainLabel } from "@/components/ui/chain-logo";
import { WalletIcon } from "@/components/icons";
import { useApi } from "@/hooks/use-api";
import { toast } from "@/components/ui/toast";
import { TxDetail } from "@/components/tx-detail";
import { TxEditDialog } from "@/components/tx-edit-dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useCategories } from "@/hooks/use-categories";
import { AGGREGATE_TIMEOUT_MS } from "@/lib/api-client";
import { formatCurrency, formatAppCurrency, getAppCurrency } from "@/lib/format";
import { fetchWalletSummary } from "@/lib/wallet-summary";
import type { TxFull } from "@/lib/transactions";
import { isoDateFromUnixSeconds } from "@/lib/wallet-dates";
import { DetailSkeleton, ChartSkeleton, LoadingRegion, StatSkeleton, TableSkeletonRows } from "@/components/loading-skeletons";

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
  holdings: Array<{ walletId: string; symbol: string; amount: number; usdValue: number | null; displayValue: number | null }>;
  /** The currency `displayValue` is in — the user's own, not necessarily USD. */
  displayCurrency: string;
  accounts: Array<{ id: string; name: string; currency: string; balance: number; balanceUsd: number | null }>;
  wallets: WalletSummary[];
};

type Transfer = {
  hash?: string;
  from?: string;
  to?: string;
  value?: number | string | null;
  asset?: string | null;
  /** Not always a number: the provider sends strings on some responses. */
  metadata?: { blockTimestamp?: number | string | null } | null;
};

/**
 * Asset colour, shared with the stablecoin tab so a token reads the same on
 * both pages. This page and that one each had their own palette, and they had
 * already drifted — this one knew ETH and SOL, that one did not, and neither
 * knew DAI or USDY.
 */
function colorFor(symbol: string): string {
  return colorForAsset(symbol);
}

function shortAddress(address: string): string {
  if (!address || address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: string }) {
  return (
    <Card className="gap-0 p-4" aria-label={label}>
      <section>
        {/* Matches MoneyStats exactly: the stablecoin tab shows balances with
            these same sizes, so a figure that is louder here makes the two
            surfaces read as different products. */}
        <h2 className="m-0 text-[12px] font-medium text-muted-foreground">{label}</h2>
        <p className="mono m-0 mt-2 text-lg font-semibold tracking-[-0.02em] text-foreground tabular-nums sm:text-xl">{value}</p>
      </section>
      <p className="m-0 mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
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
      date: isoDateFromUnixSeconds(transfer.metadata?.blockTimestamp),
      amount: incoming ? value : -value,
      category: "transfer",
      taxable: false,
      source: "wallet" as const,
      parse: { state: "manual" as const },
      note: "",
    };
  });
}

/**
 * USD amount -> the user's own currency.
 *
 * `formatAppCurrency` does not do this: it prints the number with the app currency's
 * symbol and locale, so a dollar figure renders as "₦707" — the same number
 * wearing the wrong unit. Every dollar-denominated figure on this page goes
 * through here first.
 */
async function convertUsd(
  api: ReturnType<typeof useApi>,
  usd: number,
  target: string,
): Promise<{ amount: number; currency: string }> {
  if (target === "USD" || !Number.isFinite(usd)) return { amount: usd, currency: "USD" };
  try {
    const response = await api.get<{ data: { convertedAmount: number } }>(
      `/v1/currency/convert?amount=${encodeURIComponent(usd)}&from=USD&to=${encodeURIComponent(target)}`,
    );
    return { amount: response.data.convertedAmount, currency: target };
  } catch {
    // No rate: report the dollar figure as dollars rather than mislabelling it.
    return { amount: usd, currency: "USD" };
  }
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
  const [syncing, setSyncing] = useState(false);
  // The row the user opened, and the one being edited. Two separate pieces of
  // state because editing replaces the drawer contents with a dialog rather
  // than nesting one overlay inside another.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { categories } = useCategories();
  /*
   * Syncing is a separate act from loading. Loading reads a live provider proxy;
   * syncing writes this wallet's transfers into the ledger, which is what
   * detection and the stablecoin tab read. Without the difference a page visit
   * would quietly import months of history, and the user would have no idea a
   * write had happened or be able to ask for it on demand.
   */
  const syncWallet = async () => {
    setSyncing(true);
    try {
      const response = await api.post<{ data: { created: number; events: number } }>(`/v1/wallets/${walletId}/sync`, {});
      const { created, events } = response.data;
      toast.success(
        created > 0
          ? `Added ${created} new transaction${created === 1 ? "" : "s"}${events > 0 ? `, and ${events} cash-out suggestion${events === 1 ? "" : "s"} to review` : ""}.`
          : "Already up to date — nothing new on chain.",
      );
      setSettledFor(null);
    } catch {
      toast.error("Could not sync this wallet. Try again.");
    } finally {
      setSyncing(false);
    }
  };
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
        void convertUsd(api, held, getAppCurrency()).then((converted) => {
          if (!cancelled) setDisplay(converted);
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
      if (holding.walletId !== walletId || holding.displayValue === null) continue;
      const symbol = holding.symbol.toUpperCase();
      totals.set(symbol, (totals.get(symbol) ?? 0) + holding.displayValue);
    }
    return [...totals.entries()]
      .map(([symbol, amount]) => ({ id: symbol, name: symbol, amount, color: colorFor(symbol) }))
      .sort((left, right) => right.amount - left.amount);
  }, [snapshot, walletId]);

  const heldUsd = assets.reduce((sum, item) => sum + item.amount, 0);

  // Edits applied on top of the live projection. The rows are derived from a
  // provider proxy and are recomputed on every fetch, so anything written back
  // to them directly is lost the moment that refetch lands — which would look
  // exactly like the save silently failing.
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<TxFull>>>({});
  const rows = useMemo(() => {
    const projected = transferRows(transfers, wallet?.address ?? "");
    const edited = projected.map((row) => (localEdits[row.id] ? { ...row, ...localEdits[row.id] } : row));
    return edited;
  }, [transfers, wallet?.address, localEdits]);
  /*
   * Activity totals, from the transfers already in hand rather than a second
   * request.
   *
   * "Spent" means value that left the wallet — not the sum of everything that
   * moved, and not a running total of what arrived. Each stablecoin is quoted
   * against a dollar, so summing raw token amounts is a dollar figure without
   * pretending to have converted it, and an naira-pegged token in that sum is
   * the one case where that stops being true.
   */
  const activity = useMemo(() => {
    const outgoing = rows.filter((row) => row.amount < 0);
    const incoming = rows.filter((row) => row.amount > 0);
    const spentByAsset = new Map<string, number>();
    const peggedByAsset = new Map<string, number>();
    for (const row of outgoing) {
      const symbol = row.account && row.account !== "—" ? row.account : "tokens";
      // A naira-pegged token is already naira. Adding it to a dollar total would
      // be adding 40,000 naira to a figure labelled dollars, which is not a
      // rounding error — it is two orders of magnitude of nonsense.
      const bucket = isNairaPeggedAsset(symbol) ? peggedByAsset : spentByAsset;
      bucket.set(symbol, (bucket.get(symbol) ?? 0) + Math.abs(row.amount));
    }
    const first = rows[rows.length - 1]?.date;
    return {
      transferCount: rows.length,
      sentCount: outgoing.length,
      receivedCount: incoming.length,
      spent: [...spentByAsset.values()].reduce((sum, value) => sum + value, 0),
      spentNaira: [...peggedByAsset.values()].reduce((sum, value) => sum + value, 0),
      // Named where it is a single asset, so a figure is never ambiguous about
      // what was spent when the wallet holds more than one.
      spentLabel: spentByAsset.size === 1 ? [...spentByAsset.keys()][0]! : `${spentByAsset.size} assets`,
      since: first ? first.slice(0, 7).replace("-", "/") : null,
    };
  }, [rows]);

  // Converted separately from holdings because transfers arrive from a different
  // request and can land after the net-worth snapshot has settled.
  const [spentDisplay, setSpentDisplay] = useState<{ amount: number; currency: string } | null>(null);
  const currency = getAppCurrency();
  useEffect(() => {
    let cancelled = false;
    void convertUsd(api, activity.spent, currency).then((converted) => {
      if (!cancelled) setSpentDisplay(converted);
    });
    return () => {
      cancelled = true;
    };
  }, [api, activity.spent, currency]);

  const selected = rows.find((row) => row.id === detailId) ?? null;
  const editing = rows.find((row) => row.id === editId) ?? null;

  /*
   * Wallet rows are projections, not ledger rows: they have no id the API can
   * accept and nothing to save against. Editing one therefore writes to the
   * ledger only if that wallet has been synced, and says so plainly otherwise,
   * rather than appearing to save and losing the change.
   */
  const saveWalletRow = async (next: TxFull) => {
    try {
      await api.patch(`/v1/transactions/${next.id}`, {
        categoryId: (next.categoryId ?? next.category) || null,
        isTaxable: next.taxable === true,
      });
      setLocalEdits((previous) => ({ ...previous, [next.id]: { ...previous[next.id], categoryId: next.categoryId, category: next.category, taxable: next.taxable } }));
      toast.success("Saved. This will stick for imports of the same merchant.");
    } catch {
      toast.error("Could not save that. Sync this wallet first, then try again.");
    }
  };

  // The sidebar only lists wallets the user connected, so a missing one means
  // the id is stale (deleted, or from another account).
  const missing = !loading && !balancesFailed && snapshot !== null && wallet === null;

  // No <Shell> here on purpose: `AppShell` in the (app) layout already owns the
  // sidebar, top bar, collapse toggle and floating support button for every page
  // in the group. Rendering a second one nested it inside the first produced a
  // full-height app-in-app — two sidebars, two collapse toggles — which read as
  // a separate dashboard rather than a page of this one.
  return (
    // The same wrapper every other page uses, so this scrolls in the shell's
    // one shared container instead of introducing a second scrollbar of its own.
    <div className="w-full px-6 pt-6 pb-10">
      <div className="flex flex-col gap-4">
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="small" disabled={syncing || !wallet} onClick={() => void syncWallet()}>
                    {syncing ? "Syncing…" : "Sync activity"}
                  </Button>
                  <Button variant="secondary" size="small" onClick={() => router.push("/settings")}>
                    Manage connections
                  </Button>
                </div>
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
                          <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">{wallet.displayName}</span>
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

                  {/* Four cards: holdings, assets, value sent out, and transfer
                      count. Skeletons mirror the real grid so the row does not
                      reflow when the data lands. */}
                  {loading ? (
                    <LoadingRegion label="Loading wallet balances" className="grid grid-cols-2 items-start gap-3 lg:grid-cols-4">
                      <StatSkeleton cols={1} />
                      <StatSkeleton cols={1} />
                      <StatSkeleton cols={1} />
                      <StatSkeleton cols={1} />
                    </LoadingRegion>
                  ) : (
                    <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-4">
                      <StatCard
                        label="Total holdings"
                        value={formatCurrency(display?.amount ?? 0, display?.currency ?? "USD")}
                        hint={wallet?.status === "ok" ? "Live balance" : "Balance unavailable"}
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
                      <StatCard
                        label="Total spent"
                        value={formatCurrency(spentDisplay?.amount ?? 0, spentDisplay?.currency ?? "USD")}
                        hint={
                          activity.transferCount === 0
                            ? "Nothing has left this wallet"
                            : [
                                activity.spent > 0 ? `Value sent out in ${activity.spentLabel}` : null,
                                // Never folded into the dollar figure above, and
                                // never dropped either — a user who cashed out
                                // cNGN deserves to see it somewhere.
                                activity.spentNaira > 0 ? `+ ${formatCurrency(activity.spentNaira, "NGN")} cNGN` : null,
                                activity.since ? `since ${activity.since}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")
                        }
                      />
                      <StatCard
                        label="Transfers"
                        value={String(activity.transferCount)}
                        hint={
                          activity.transferCount === 0
                            ? "No transfers yet"
                            : `${activity.sentCount} out · ${activity.receivedCount} in${activity.since ? ` · since ${activity.since}` : ""}`
                        }
                      />
                  </div>
                  )}

                  {loading ? (
                    <LoadingRegion label="Loading asset breakdown">
                      <ChartSkeleton height="h-[220px]" />
                    </LoadingRegion>
                  ) : (
                    <BreakdownPie title="Holdings by asset" items={assets} filterLabel="All assets" currency={snapshot?.displayCurrency ?? "USD"} />
                  )}

                  <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      {summaryState === "loading" ? (
                        <LoadingRegion label="Loading on-chain activity" className="mb-2">
                          <TableSkeletonRows rows={4} columns={2} />
                        </LoadingRegion>
                      ) : null}
                      <FlowTable
                        title="Recent activity"
                        typeLabel="On-chain"
                        filterLabel={chainLabel(wallet?.chain ?? "BASE")}
                        rows={rows}
                        signed
                        onSelectRow={(row) => setDetailId(row.id)}
                        emptyTitle="No transfers yet"
                        emptyBody="Nothing has moved in or out of this address."
                      />
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
                          <span className="mono shrink-0 text-[13px] font-medium text-foreground tabular-nums">
                            {formatCurrency(asset.amount, snapshot?.displayCurrency ?? "USD")}
                          </span>
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

      {/* Opening a transfer is the only way to see which chain it was on, what
          it moved, and to categorise it. A drawer rather than a dialog so it
          sits over the activity list it came from, which is where a user
          compares two rows against each other. */}
      <Drawer open={selected !== null} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DrawerContent className="[--drawer-content-width:min(25rem,calc(100vw-4rem))] sm:[--drawer-content-width:25rem]">
          <DrawerHeader>
            <DrawerTitle>Transfer</DrawerTitle>
          </DrawerHeader>
          {selected ? (
            <div className="scrollbar-hide flex-1 overflow-y-auto px-6 pt-2 pb-6">
              <TxDetail
                tx={selected}
                chain={wallet?.chain ?? null}
                onClose={() => setDetailId(null)}
                onEdit={() => setEditId(selected.id)}
              />
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>

      <TxEditDialog
        tx={editing}
        open={editing !== null}
        onOpenChange={(open) => { if (!open) setEditId(null); }}
        onSave={(next) => {
          void saveWalletRow(next);
          return true;
        }}
        categories={categories}
      />
    </div>
  );
}

/**
 * Bank accounts: the wallets structure with the asset donut swapped for a
 * statement breakdown, since an account is triaged by statement rather than by
 * asset. Kept reachable in code so the two can be compared before the statement
 * pipeline exists, but the tab that would open it ships disabled.
 */
/**
 * Bank accounts. Not reachable yet — the tab ships disabled — so this converts
 * its total now rather than when someone finally enables it.
 *
 * That is the point of the change. The same relabelling bug shipped three times
 * on this page while each occurrence was individually harmless and invisible in
 * review; the fourth would have sat behind a disabled tab until the day the tab
 * was turned on. A tab nobody can reach is exactly where a known-wrong figure
 * hides longest.
 */
function AccountsTab({ accounts, loading }: { accounts: NetWorthSnapshot["accounts"]; loading: boolean }) {
  const api = useApi();
  const real = accounts.filter((account) => !account.id.startsWith("unassigned-"));
  const unassigned = accounts.filter((account) => account.id.startsWith("unassigned-"));
  const totalUsd = accounts.reduce((sum, account) => sum + (account.balanceUsd ?? 0), 0);
  const [total, setTotal] = useState<{ amount: number; currency: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void convertUsd(api, totalUsd, getAppCurrency()).then((converted) => {
      if (!cancelled) setTotal(converted);
    });
    return () => {
      cancelled = true;
    };
  }, [api, totalUsd]);

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <StatCard
          label="Total across accounts"
          value={formatCurrency(total?.amount ?? 0, total?.currency ?? "USD")}
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
          <LoadingRegion label="Loading account balances" className="px-4 py-4">
            <DetailSkeleton lines={2} />
          </LoadingRegion>
        ) : null}
      </Card>
    </>
  );
}
