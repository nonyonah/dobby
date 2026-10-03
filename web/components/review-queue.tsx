"use client";

import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "./ui/button";
import { Alert, AlertContent, AlertDescription, AlertIndicator, AlertTitle } from "./ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { TableShell } from "./ui/table-shell";
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "./ui/toolbar";
import { formatCurrency } from "@/lib/format";
import { useAppCurrency } from "@/hooks/use-app-currency";
import { categoryMeta, type TxFull } from "@/lib/transactions";
import { HugeiconsIcon } from "@hugeicons/react";
import { EditIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { CardIcon, CheckIcon, CloseSmallIcon, EmailIcon, FileIcon, ManualIcon, ReceiptIcon, WalletIcon } from "./icons";
import type { TxSource } from "@/lib/finance";
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

export interface ReviewCategoryOption {
  id: string;
  name: string;
  emoji: string;
}

interface ReviewQueueProps {
  rows: TxFull[];
  categories: ReviewCategoryOption[];
  onApprove: (ids: string[], overrides?: Record<string, string>) => void;
  onDecline: (ids: string[]) => void;
  onEdit: (id: string) => void;
  /** An approval is in flight — approve controls lock with progress copy. A string overrides the label. */
  busy?: boolean | string;
  /** Deep-linked row id (from Needs attention / flags) to highlight + scroll to. */
  focusId?: string;
}

export function ReviewQueue({ rows, categories, onApprove, onDecline, onEdit, busy = false, focusId }: ReviewQueueProps) {
  // Fallback for rows the API could not price, so an unpriced amount never wears
  // a symbol the preference has moved away from.
  const appCurrency = useAppCurrency();
  const busyLabel = typeof busy === "string" ? busy : "Approving…";
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const reduce = useReducedMotion() ?? false;
  const allChecked = rows.length > 0 && rows.every((row) => checked.has(row.id));
  const approvableRows = rows.filter((row) => !row.needsManualReview);
  // `amount` is already converted into the display currency; `sourceAmount` and
  // `currency` are what the statement was actually denominated in. They are only
  // both worth showing when the two currencies differ.
  const currencyFacts = (row: TxFull) => {
    const displayCurrency = row.displayCurrency ?? appCurrency;
    const sourceCurrency = typeof row.currency === "string" ? row.currency.toUpperCase() : null;
    const sourceAmount = row.sourceAmount;
    const convertible =
      typeof sourceAmount === "number" &&
      Number.isFinite(sourceAmount) &&
      sourceCurrency !== null &&
      sourceCurrency !== displayCurrency.toUpperCase();
    return {
      displayCurrency,
      // Formatted here so the cell needs no narrowing, and null when there is
      // nothing worth adding — an account already in the display currency, or a
      // row we never priced.
      sourceLabel: convertible ? formatCurrency(Math.abs(sourceAmount), sourceCurrency) : null,
    };
  };

  const toggle = (id: string) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const approve = (ids: string[]) => {
    const approvableIds = ids.filter((id) => !rows.find((row) => row.id === id)?.needsManualReview);
    if (approvableIds.length === 0) return;
    const selectedOverrides: Record<string, string> = {};
    for (const id of approvableIds) {
      if (overrides[id]) selectedOverrides[id] = overrides[id];
    }
    onApprove(approvableIds, selectedOverrides);
    setChecked((current) => new Set([...current].filter((id) => !approvableIds.includes(id))));
    setOverrides((current) => {
      const next = { ...current };
      for (const id of approvableIds) delete next[id];
      return next;
    });
  };

  // Bring a deep-linked row into view so the user lands on it directly.
  React.useEffect(() => {
    if (!focusId) return;
    const node = document.getElementById(focusId);
    node?.scrollIntoView({ block: "center" });
  }, [focusId, rows.length]);

  const setOverride = (id: string, categoryId: string | null) => {
    setOverrides((current) => {
      const next = { ...current };
      if (categoryId) next[id] = categoryId;
      else delete next[id];
      return next;
    });
  };

  return (
    <>
      {/* An alert, not a toast: a transaction waiting on a decision is a state
          the user still has to act on, and it stays until they do. */}
      <Alert status="accent" className="mb-3">
        <AlertIndicator>
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} size={16}  />
        </AlertIndicator>
        <AlertContent>
          <AlertTitle className="flex flex-wrap items-center gap-2">
            To review
            {rows.length > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
                {rows.length}
              </span>
            ) : null}
          </AlertTitle>
          <AlertDescription>AI-suggested categories and tax treatment are ready for a quick decision.</AlertDescription>
        </AlertContent>
        {rows.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-center">
            <Button variant="ghost" size="small" onClick={() => onDecline(rows.map((row) => row.id))}>Decline all</Button>
            {approvableRows.length > 0 ? (
              <Button variant="primary" size="small" disabled={busy !== false} onClick={() => approve(approvableRows.map((row) => row.id))}>
                {busy ? busyLabel : "Approve all"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </Alert>
      <div className="mb-4">
        {rows.length === 0 ? (
          <div className="rounded-lg bg-muted px-4 py-5 text-center" role="status">
            <p className="m-0 text-[13px] font-medium">You’re all caught up</p>
            <p className="m-0 mt-1 text-[12px] text-muted-foreground">Nothing is waiting on you. Import a statement or add a transaction by hand — anything Dobby isn’t sure about lands here for a quick yes or no.</p>
          </div>
        ) : (
          <TableShell className="text-[13px]">
            <Table aria-label="Transactions waiting for approval">
              <TableHeader>
                <TableRow className="hover:bg-transparent!">
                  <TableHead className="w-10 px-2 py-2"><input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((row) => row.id)))} aria-label="Select all transactions to review" className="size-4 accent-primary" /></TableHead>
                  <TableHead className="px-2 py-2 font-medium">Transaction</TableHead>
                  <TableHead className="px-2 py-2 font-medium">AI suggestion</TableHead>
                  <TableHead className="px-2 py-2 font-medium">Source</TableHead>
                  <TableHead className="px-2 py-2 text-right font-medium">Amount</TableHead>
                  <TableHead className="px-2 py-2 text-right font-medium">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-surface">
                {rows.map((row) => {
                  const { displayCurrency, sourceLabel } = currencyFacts(row);
                  const meta = categoryMeta(row.category, row.categoryName);
                  const SourceIcon = SOURCE_ICON[row.source];
                  const suggestedId = categories.some((c) => c.id === row.categoryId) ? row.categoryId : undefined;
                  return <TableRow key={row.id} id={row.id} data-focused={focusId === row.id ? "true" : undefined} className={`border-b border-line last:border-0 ${focusId === row.id ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}`}>
                    <TableCell className="px-2 py-3"><input type="checkbox" checked={checked.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select row: ${row.name}`} className="size-4 accent-primary" /></TableCell>
                    <TableCell className="px-2 py-3 leading-normal"><span className="block font-medium">{row.name}</span><span className="block text-[12px] text-muted-foreground">{row.account} · {row.date.slice(5).replace("-", "/")}</span></TableCell>
                    <TableCell className="px-2 py-3">
                      {categories.length > 0 ? (
                        <select
                          aria-label={`Category for ${row.name}`}
                          value={overrides[row.id] ?? suggestedId ?? ""}
                          onChange={(event) => setOverride(row.id, event.target.value || suggestedId || null)}
                          className="h-7 min-w-36 cursor-pointer appearance-none rounded-lg border border-line bg-card bg-[length:14px] bg-[right_0.4rem_center] bg-no-repeat px-2 pr-6 text-[12px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 bg-muted"
                          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a8b91' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")" }}
                        >
                          {categories.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.emoji} {option.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <CategoryChip id={row.categoryId ?? row.category} name={row.categoryName} color={row.categoryColor} />
                      )}
                      <span className="ml-2 text-[11px] text-muted-foreground">{row.taxable ? "Taxable" : "Non-tax"} · {row.parse.confidence}%{overrides[row.id] ? " · edited" : ""}</span>
                    </TableCell>
                    <TableCell className="px-2 py-3"><span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground" title={SOURCE_LABEL[row.source]}><SourceIcon />{SOURCE_LABEL[row.source]}</span></TableCell>
                    <TableCell className="px-2 py-3 text-right">
                      {row.needsManualReview ? (
                        <span className="mono text-[12px] text-muted-foreground">Not extracted</span>
                      ) : (
                        <span className="mono block tabular-nums">
                          {/* The converted figure leads, but only ever next to the
                              currency it was actually fetched in. Showing the
                              converted number alone made a naira statement look
                              like a dollar one, which is the whole reason a
                              statement import exists. */}
                          <span className={`block text-[13px] font-medium ${row.amount >= 0 ? "text-success" : "text-danger"}`}>
                            {row.amount >= 0 ? "+" : "−"}
                            {formatCurrency(Math.abs(row.amount), displayCurrency)}
                          </span>
                          {sourceLabel ? (
                            <span className="block text-[11px] text-muted-foreground">{sourceLabel}</span>
                          ) : null}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-3"><div className="flex justify-end gap-1">{!row.needsManualReview ? <><Button variant="ghost" size="icon-sm" onClick={() => onEdit(row.id)} aria-label={`Edit ${row.name}`} title="Edit before approving"><HugeiconsIcon icon={EditIcon} size={15}  /></Button><Button variant="secondary" size="small" disabled={busy !== false} onClick={() => approve([row.id])}><CheckIcon /> {busy ? busyLabel : "Approve"}</Button></> : null}<Button variant="ghost" size="small" className="text-destructive hover:text-destructive" onClick={() => onDecline([row.id])}><CloseSmallIcon /> Decline</Button></div></TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </TableShell>
        )}
      </div>
      <AnimatePresence>
        {checked.size > 0 ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, x: "-50%" }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 left-1/2 z-40"
          >
            {/* coss Toolbar owns the `role="toolbar"`; the wrapper only
                carries the entrance motion and the fixed anchor. */}
            <Toolbar
              aria-label={`${checked.size} review transactions selected`}
              className="items-center rounded-[50px] border-line px-3 py-1 shadow-[0_16px_48px_rgb(23_24_28/0.3)] dark:shadow-[0_16px_48px_rgb(0_0_0/0.55)]"
            >
              <p className="m-0 px-2 text-[13px] font-medium whitespace-nowrap text-foreground" aria-live="polite">
                {checked.size} selected
              </p>
              <ToolbarSeparator />
              <ToolbarGroup>
                <ToolbarButton render={<Button variant="ghost" size="small" className="text-destructive hover:text-destructive" onClick={() => { onDecline([...checked]); setChecked(new Set()); }}><CloseSmallIcon /> Decline</Button>} />
                <ToolbarButton render={<Button variant="secondary" size="small" disabled={busy !== false} onClick={() => approve([...checked])}><CheckIcon /> {busy ? busyLabel : "Approve"}</Button>} />
              </ToolbarGroup>
              <ToolbarSeparator />
              <ToolbarButton render={<Button variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setChecked(new Set())}><CloseSmallIcon /></Button>} />
            </Toolbar>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
