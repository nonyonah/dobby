"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useApi } from "@/hooks/use-api";
import { AGGREGATE_TIMEOUT_MS } from "@/lib/api-client";
import { toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/format";
import { guidanceFor, guidanceText } from "@/lib/error-guidance";

type Holding = { walletId: string; symbol: string; amount: number; usdValue: number | null };
type WalletStatus = { id: string; displayName: string; chain: string; address: string; status: "ok" | "provider_unconfigured" | "error"; detail?: string };
type NetWorthSnapshot = {
  asOf: string;
  currency: string;
  totalUsd: number;
  holdings: Holding[];
  wallets: WalletStatus[];
  unpricedCount: number;
};

/**
 * Live net worth from connected wallets, for every signed-in user — the
 * figure is never behind the Pro plan. Only audited stablecoin contracts
 * are priced; everything else is listed unpriced rather than guessed at.
 */
export function NetWorthSection({ className = "" }: { className?: string }) {
  const api = useApi();
  const [snapshot, setSnapshot] = useState<NetWorthSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<{ data: NetWorthSnapshot }>("/v1/insights/net-worth", { timeoutMs: AGGREGATE_TIMEOUT_MS })
      .then((response) => {
        if (!cancelled) setSnapshot(response.data);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSnapshot(null);
        const guidance = guidanceFor(error, "wallet");
        toast.error(guidance.title, {
          description: guidanceText(guidance),
          action: { label: "Try again", onPress: () => setAttempt((current) => current + 1) },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const unconfigured = snapshot?.wallets.filter((wallet) => wallet.status === "provider_unconfigured") ?? [];
  const errored = snapshot?.wallets.filter((wallet) => wallet.status === "error") ?? [];

  return (
    <Card className={`mt-8 ${className}`}>
      <CardHeader>
        <CardTitle>Net worth</CardTitle>
        <CardDescription>
          {snapshot
            ? `Live stablecoin balances across ${snapshot.wallets.length} ${snapshot.wallets.length === 1 ? "wallet" : "wallets"} · ${new Date(snapshot.asOf).toLocaleString()}`
            : "Loading balances from your connected wallets…"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {snapshot === null ? (
          <p className="m-0 py-2 text-[13px] text-muted-foreground" role="status">Loading net worth…</p>
        ) : snapshot.wallets.length === 0 ? (
          <div className="rounded-lg bg-muted px-3 py-4 text-center" role="status">
            <p className="m-0 text-[13px] font-medium">No wallets connected yet</p>
            <p className="m-0 mt-1 text-[12px] text-muted-foreground">Your net worth already counts bank and card balances — connecting a Base or Solana wallet adds your stablecoin holdings on top.</p>
            <Link href="/settings" className="mt-2.5 inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">Connect a wallet</Link>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div>
                <p className="m-0 text-[12px] text-muted-foreground">Net worth</p>
                <p className="mono m-0 mt-1 text-[18px] font-semibold tabular-nums">{formatCurrency(snapshot.totalUsd, snapshot.currency)}</p>
              </div>
              <div>
                <p className="m-0 text-[12px] text-muted-foreground">Assets tracked</p>
                <p className="mono m-0 mt-1 text-[13px] font-medium tabular-nums">{snapshot.holdings.length}</p>
              </div>
              <div>
                <p className="m-0 text-[12px] text-muted-foreground">Not priced</p>
                <p className="mono m-0 mt-1 text-[13px] font-medium tabular-nums">{snapshot.unpricedCount}</p>
              </div>
            </div>

            <ul className="m-0 list-none divide-y divide-line p-0">
              {snapshot.holdings.map((holding) => (
                <li key={`${holding.walletId}-${holding.symbol}-${holding.amount}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{holding.symbol}</span>
                    <span className="block text-[12px] text-muted-foreground">{snapshot.wallets.find((wallet) => wallet.id === holding.walletId)?.displayName}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="mono block text-[13px] font-medium tabular-nums">{holding.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
                    <span className="mono block text-[12px] tabular-nums text-muted-foreground">
                      {holding.usdValue === null ? "not priced" : formatCurrency(holding.usdValue, snapshot.currency)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {unconfigured.length > 0 ? (
              <p className="m-0 mt-3 text-[12px] text-muted-foreground">
                {unconfigured.map((wallet) => wallet.displayName).join(", ")} needs a data provider configured before balances can load.
              </p>
            ) : null}
            {errored.length > 0 ? (
              <p className="m-0 mt-1 text-[12px] text-warning">
                {errored.map((wallet) => wallet.displayName).join(", ")} could not be reached just now.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
