"use client";

import { useState } from "react";
import { Table as HeroTable } from "@heroui/react";
import { formatUSD } from "@/lib/format";
import type { TxFull } from "@/lib/transactions";
import { Button } from "./ui/button";

interface FlowTableProps {
  title: string;
  rows: TxFull[];
  income?: boolean;
  typeLabel: string;
  filterLabel: string;
}

const PAGE_SIZE = 8;

/** Paginated HeroUI v3 ledger used by the spending and income insight tabs. */
export function FlowTable({ title, rows, income = false, typeLabel, filterLabel }: FlowTableProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const from = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, rows.length);

  return (
    <section aria-label={title}>
      <HeroTable variant="primary" className="text-[13px]">
        <HeroTable.ScrollContainer>
          <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-3">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</span>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full border border-line bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{typeLabel}</span>
              <span className="rounded-full border border-line bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{filterLabel}</span>
            </div>
          </div>
          <HeroTable.Content aria-label={title}>
            <HeroTable.Header>
              <HeroTable.Column className="px-3 py-2 text-[12px] font-medium text-muted-foreground">Date</HeroTable.Column>
              <HeroTable.Column id="transaction" isRowHeader className="px-3 py-2 text-[12px] font-medium text-muted-foreground">Transaction</HeroTable.Column>
              <HeroTable.Column className="px-3 py-2 text-right text-[12px] font-medium text-muted-foreground">Amount</HeroTable.Column>
            </HeroTable.Header>
            <HeroTable.Body>
              {pageRows.map((transaction) => (
                <HeroTable.Row key={transaction.id} id={transaction.id} className="border-b border-line hover:bg-secondary">
                  <HeroTable.Cell className="whitespace-nowrap px-3 py-2.5 text-[12px] text-muted-foreground">
                    {transaction.date.slice(5).replace("-", "/")}
                  </HeroTable.Cell>
                  <HeroTable.Cell className="max-w-56 truncate px-3 py-2.5 font-medium">
                    {transaction.name}
                  </HeroTable.Cell>
                  <HeroTable.Cell className={`mono px-3 py-2.5 text-right font-medium tabular-nums ${income ? "text-success-vivid" : ""}`}>
                    {income ? "+" : "−"}{formatUSD(Math.abs(transaction.amount))}
                  </HeroTable.Cell>
                </HeroTable.Row>
              ))}
              {rows.length === 0 ? (
                <HeroTable.Row id="empty">
                  <HeroTable.Cell colSpan={3} className="px-3 py-10 text-center">
                    <p className="m-0 text-[13px] font-medium">No transactions for this month</p>
                    <p className="m-0 mt-1 text-[12px] text-muted-foreground">Try another month to see activity.</p>
                  </HeroTable.Cell>
                </HeroTable.Row>
              ) : null}
            </HeroTable.Body>
          </HeroTable.Content>
        </HeroTable.ScrollContainer>
      </HeroTable>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[12px] text-muted-foreground">Showing {from}–{to} of {rows.length}</p>
        <div className="flex items-center gap-2">
          <span className="sr-only" aria-live="polite">Page {safePage} of {totalPages}</span>
          <Button variant="secondary" size="small" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
          <Button variant="secondary" size="small" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
        </div>
      </div>
    </section>
  );
}
