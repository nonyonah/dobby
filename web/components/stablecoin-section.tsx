"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import { AGGREGATE_TIMEOUT_MS } from "@/lib/api-client";
import { formatCurrency, formatUSD, getAppCurrency } from "@/lib/format";
import { MONTH_LABELS } from "@/lib/insights-data";
import type { TxFull } from "@/lib/transactions";
import { MoneyStats } from "@/components/money-stats";
import { BreakdownPie } from "@/components/breakdown-pie";
import { FlowNarrative } from "@/components/flow-narrative";
import { FlowTable } from "@/components/flow-table";
import { LoadingRegion, TableSkeletonRows } from "@/components/loading-skeletons";

/** Assets that count as stablecoins anywhere in the app. CNGN is Nigeria's. */
export const STABLECOIN_SYMBOLS = ["USDC", "USDT", "CNGN"];

const ASSET_COLORS: Record<string, string> = {
  USDC: "#2775ca",
  USDT: "#26a17b",
  CNGN: "#7c3aed",
};

const MONTHS = MONTH_LABELS.map((label, value) => ({ value, label }));

export function isStablecoinAsset(symbol?: string | null): boolean {
  return Boolean(symbol && STABLECOIN_SYMBOLS.includes(symbol.toUpperCase()));
}

type NetWorthPayload = {
  totalUsd: number;
  holdings: Array<{ walletId: string; symbol: string; amount: number; usdValue: number | null }>;
};

/**
 * Stablecoin tab: what is held in stablecoins right now plus the selected
 * month's stablecoin-only income, spend, and asset mix. Rows arrive already
 * filtered to USDC / USDT / CNGN, so nothing fiat or volatile slips in —
 * exactly like the income and spending tabs, the month filter drives the
 * chart, the table, and the summary.
 */
export function StablecoinSection({
  year,
  month,
  onMonthChange,
  rows,
  loading,
}: {
  year: number;
  month: number;
  onMonthChange: (month: number) => void;
  rows: TxFull[];
  loading: boolean;
}) {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [holdings, setHoldings] = useState<{ amount: number; currency: string } | null>(null);
  const [walletCount, setWalletCount] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    // Holdings price in USD; convert to the display currency so the Balance
    // stat never wears the wrong symbol the way raw amounts used to.
    void api
      .get<{ data: NetWorthPayload }>("/v1/insights/net-worth", { timeoutMs: AGGREGATE_TIMEOUT_MS })
      .then((response) => {
        if (cancelled) return;
        const priced = response.data.holdings.filter((holding) => holding.usdValue !== null);
        const usd = priced.reduce((sum, holding) => sum + (holding.usdValue ?? 0), 0);
        setWalletCount(new Set(priced.map((holding) => holding.walletId)).size);
        const target = getAppCurrency();
        if (target === "USD") {
          setHoldings({ amount: usd, currency: "USD" });
          return;
        }
        void api
          .get<{ data: { convertedAmount: number } }>(
            `/v1/currency/convert?amount=${encodeURIComponent(usd)}&from=USD&to=${encodeURIComponent(target)}`,
          )
          .then((conversion) => {
            if (!cancelled) setHoldings({ amount: conversion.data.convertedAmount, currency: target });
          })
          .catch(() => {
            if (!cancelled) setHoldings({ amount: usd, currency: "USD" });
          });
      })
      .catch(() => { if (!cancelled) setHoldings(null); });
    return () => { cancelled = true; };
  }, [api, isLoaded, isSignedIn]);

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthRows = rows.filter((row) => row.date.startsWith(monthPrefix));
  const income = monthRows.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const expense = monthRows.filter((row) => row.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const earnings = income - expense;
  const monthLabel = MONTH_LABELS[month] ?? "";
  const assets = STABLECOIN_SYMBOLS.map((symbol) => ({
    id: symbol,
    name: symbol,
    amount: monthRows
      .filter((row) => (row.asset ?? "").toUpperCase() === symbol)
      .reduce((sum, row) => sum + Math.abs(row.amount), 0),
    color: ASSET_COLORS[symbol] ?? "#8a8b91",
  }));
  const busiest = [...assets].sort((left, right) => right.amount - left.amount)[0];

  return (
    <div className="flex flex-col gap-4">
      <MoneyStats
        stats={[
          { label: "Balance", value: holdings?.amount ?? 0, delta: null },
          { label: "Income", value: income, delta: null },
          { label: "Expense", value: expense, delta: null, invert: true, minus: true },
          { label: "Total earnings", value: earnings, delta: null, minus: earnings < 0 },
        ]}
      />
      <BreakdownPie
        title="Stablecoins by asset"
        items={assets}
        month={month}
        year={year}
        months={MONTHS}
        onMonthChange={onMonthChange}
        filterLabel="All assets"
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loading ? (
            <LoadingRegion label={`Loading stablecoin transactions for ${year}`} className="mb-2">
              <TableSkeletonRows rows={4} columns={2} />
            </LoadingRegion>
          ) : null}
          <FlowTable
            title="Transactions"
            typeLabel="Stablecoin"
            filterLabel="USDC · USDT · CNGN"
            rows={monthRows}
            signed
          />
        </div>
        <FlowNarrative title="Stablecoin summary">
          <p className="m-0">
            You hold <strong>{formatCurrency(holdings?.amount ?? 0, holdings?.currency ?? "USD")}</strong> in stablecoins
            {walletCount > 0 ? ` across ${walletCount} connected wallet${walletCount === 1 ? "" : "s"}` : ""}.
          </p>
          <p className="m-0">
            In {monthLabel} {year}, <strong>{formatUSD(income)}</strong> came in and{" "}
            <strong>{formatUSD(expense)}</strong> went out — a net{" "}
            <strong>{formatUSD(earnings)}</strong>.
          </p>
          <p className="m-0">
            {busiest && busiest.amount > 0
              ? <><strong>{busiest.name}</strong> moved the most at {formatUSD(busiest.amount)} of the {formatUSD(assets.reduce((sum, asset) => sum + asset.amount, 0))} total.</>
              : <>No stablecoin movements in {monthLabel} yet.</>}
          </p>
          <p className="m-0">Only USDC, USDT, and CNGN movements are counted here.</p>
        </FlowNarrative>
      </div>
    </div>
  );
}
