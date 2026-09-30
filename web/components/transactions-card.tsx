"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/hooks/use-api";
import { Skeleton } from "./ui/skeleton";
import { EmptyState } from "./ui/empty-state";
import { formatUSD } from "@/lib/format";
import type { TxSource, Tx } from "@/lib/finance";
import { ModuleCard } from "./module-card";
import { CardIcon, EmailIcon, FileIcon, ManualIcon, ReceiptIcon, WalletIcon } from "./icons";

const SOURCE_ICON: Record<TxSource, (props: { className?: string }) => React.ReactNode> = {
  manual: ManualIcon,
  email: EmailIcon,
  card: CardIcon,
  wallet: WalletIcon,
  statement: FileIcon,
  receipt: ReceiptIcon,
};

const SOURCE_LABEL: Record<TxSource, string> = {
  manual: "Manual entry",
  email: "Email receipt",
  card: "Card sync",
  wallet: "Wallet sync",
  statement: "Statement",
  receipt: "Receipt",
};

export function TransactionsCard() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [loaded, setLoaded] = useState(false);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void api.get<{ data: Array<{ id: string; description: string; merchant?: string | null; amount: number | string; displayAmount?: number | string | null; type: "INCOME" | "EXPENSE"; occurredAt: string; source?: string | null }> }>("/v1/transactions?page=1&pageSize=5&sort=occurredAt&direction=desc").then((response) => setRows(response.data.map((item) => ({ id: item.id, name: item.merchant || item.description, date: item.occurredAt.slice(5, 10).replace("-", "/"), amount: item.type === "INCOME" ? Number(item.displayAmount ?? item.amount) : -Math.abs(Number(item.displayAmount ?? item.amount)), source: item.source === "email" || item.source === "card" || item.source === "wallet" ? item.source : "manual" })))).catch(() => setRows([])).finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  return (
    <ModuleCard title="Last transactions" linkLabel="View all">
      {!loaded ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-2.5">
              <Skeleton className="size-7 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-16" /></div>
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
      ) : null}
      {loaded && rows.length === 0 ? (
        <EmptyState
          compact
          icon={<ReceiptIcon />}
          title="No transactions yet"
          suggestion="Connect an email or upload a statement to fill this in — or add one by hand while you wait."
          action={{ label: "Import transactions", href: "/transactions" }}
        />
      ) : null}
      <ul className="m-0 list-none p-0">
        {rows.map((t) => {
          const Icon = SOURCE_ICON[t.source];
          const income = t.amount >= 0;
          return (
            <li
              key={t.id}
              className="flex items-center gap-2.5 border-b border-soft-line py-2 last:border-b-0 last:pb-0 first:pt-0"
            >
              <span
                title={SOURCE_LABEL[t.source]}
                aria-label={SOURCE_LABEL[t.source]}
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
              >
                <Icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {t.name}
                </span>
                <span className="block text-[12px] text-muted-foreground">{t.date}</span>
              </span>
              <span
                className={`mono shrink-0 text-[13px] font-medium tabular-nums ${income ? "text-success" : "text-foreground"}`}
              >
                {income ? "+" : "−"}
                {formatUSD(Math.abs(t.amount))}
              </span>
            </li>
          );
        })}
      </ul>
    </ModuleCard>
  );
}
