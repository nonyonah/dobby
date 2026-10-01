"use client";

import { Button } from "./ui/button";
import { formatUSD } from "@/lib/format";
import { categoryMeta, type TxFull } from "@/lib/transactions";
import type { TxSource } from "@/lib/finance";
import { CardIcon, EmailIcon, FileIcon, ManualIcon, ReceiptIcon, WalletIcon } from "./icons";
import { CategoryChip } from "@/components/ui/category-chip";

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

interface TxDetailProps {
  tx: TxFull | null;
  onClose: () => void;
  onEdit: () => void;
  onToggleBudget?: (tx: TxFull) => void;
}

export function TxDetail({ tx, onEdit, onToggleBudget }: TxDetailProps) {
  if (!tx) {
    return (
      <div className="p-6 text-center">
        <p className="m-0 text-[13px] font-medium text-foreground">No transaction selected</p>
        <p className="m-0 mt-1 text-[12px] text-muted-foreground">Pick a row to see the details</p>
      </div>
    );
  }

  const meta = categoryMeta(tx.categoryId ?? tx.category, tx.categoryName);
  const SIcon = SOURCE_ICON[tx.source];
  const income = tx.amount >= 0;
  const date = new Date(`${tx.date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <p className="m-0 text-[12px] text-muted-foreground">{tx.taxable ? "Taxable transaction" : "Regular transaction"}</p>
      </div>

      <div className="px-4 pt-3">
        <p className="m-0 text-[12px] text-muted-foreground">{date}</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">{tx.name}</h2>
          <p className={`mono m-0 shrink-0 text-[16px] font-semibold tabular-nums ${income ? "text-success" : "text-danger"}`}>
            {income ? "+" : "−"}{formatUSD(Math.abs(tx.amount))}
          </p>
        </div>
        <p className="m-0 mt-1 text-[12px] text-muted-foreground">{tx.account}</p>
      </div>

      <div className="px-4 py-2">
        <Row label="Category">
          <CategoryChip id={meta.id} name={meta.label} color={meta.hex} />
        </Row>
        <Row label="Taxable">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium ${
              tx.taxable
                ? "border-transparent bg-accent text-white"
                : "border-transparent bg-secondary text-secondary-foreground"
            }`}
          >
            {tx.taxable ? "Taxable" : "Non-tax"}
          </span>
        </Row>
        <Row label="Source">
          <span className="inline-flex items-center gap-1.5">
            <SIcon />
            <span className="text-[13px]">{SOURCE_LABEL[tx.source]}</span>
          </span>
        </Row>
        {onToggleBudget && (tx.kind === "TRANSFER" || (tx.source === "wallet" && tx.kind !== "INCOME" && tx.amount < 0)) ? (
          <Row label="Budgets">
            {tx.kind === "TRANSFER" ? (
              <span className="inline-flex flex-wrap items-center justify-end gap-2">
                <span className="text-[13px] text-muted-foreground">Excluded</span>
                <button
                  type="button"
                  onClick={() => onToggleBudget({ ...tx, kind: "EXPENSE" })}
                  className="cursor-pointer rounded-md text-[13px] font-medium text-accent outline-none hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Treat as regular spending
                </button>
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center justify-end gap-2">
                <span className="text-[13px] text-muted-foreground">Included</span>
                <button
                  type="button"
                  onClick={() => onToggleBudget({ ...tx, kind: "TRANSFER" })}
                  className="cursor-pointer rounded-md text-[13px] font-medium text-accent outline-none hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Exclude from budgets
                </button>
              </span>
            )}
          </Row>
        ) : null}
        <Row label="Parsing">
          {tx.parse.state === "parsed" ? (
            <span className="text-[13px] text-success">Parsed · {tx.parse.confidence}% confidence</span>
          ) : tx.parse.state === "review" ? (
            <span className="text-[13px] text-warning">Needs review · {tx.parse.confidence}% confidence</span>
          ) : (
            <span className="text-[13px] text-muted-foreground">Entered manually</span>
          )}
        </Row>
        <Row label="Note">
          <span className="text-[13px] text-muted-foreground">{tx.note || "—"}</span>
        </Row>
      </div>

      <div className="px-4 pb-4">
        <Button variant="secondary" onClick={onEdit} className="w-full">
          Edit transaction
        </Button>
      </div>
    </div>
  );
}
