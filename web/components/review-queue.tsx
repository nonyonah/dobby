"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Table as HeroTable } from "@heroui/react";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Alert, AlertContent, AlertDescription, AlertTitle } from "./ui/alert";
import { formatUSD } from "@/lib/format";
import { categoryMeta, type TxFull } from "@/lib/transactions";
import { PencilSimple, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { CardIcon, CheckIcon, CloseSmallIcon, EmailIcon, FileIcon, ManualIcon, ReceiptIcon, WalletIcon } from "./icons";
import type { TxSource } from "@/lib/finance";

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
}

export function ReviewQueue({ rows, categories, onApprove, onDecline, onEdit }: ReviewQueueProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const reduce = useReducedMotion() ?? false;
  const allChecked = rows.length > 0 && rows.every((row) => checked.has(row.id));
  const approvableRows = rows.filter((row) => !row.needsManualReview);

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
      <Alert status="default" className="mb-3 flex items-center justify-between gap-4 rounded-2xl border-0 bg-card px-4 py-3 text-foreground shadow-none">
        <AlertContent className="flex min-w-0 items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#eceefb] text-[#4a55c9] dark:bg-[#23264a] dark:text-[#c7cbf5]" aria-hidden="true"><Sparkle size={14} /></span>
          <div className="min-w-0">
            <AlertTitle className="flex items-center gap-2 text-[13px] text-foreground">
              To review
              <span className="rounded-full bg-[#f6ecd6] px-2 py-0.5 text-[11px] font-medium text-[#ad7f22]">{rows.length}</span>
            </AlertTitle>
            <AlertDescription className="mt-1 text-[12px] text-[#6b6d72] dark:text-[#a2a3a8]">AI-suggested categories and tax treatment are ready for a quick decision.</AlertDescription>
          </div>
        </AlertContent>
        {rows.length > 0 ? <div className="flex shrink-0 gap-2"><Button variant="ghost" size="small" onClick={() => onDecline(rows.map((row) => row.id))}>Decline all</Button>{approvableRows.length > 0 ? <Button variant="primary" size="small" onClick={() => approve(approvableRows.map((row) => row.id))}>Approve all</Button> : null}</div> : null}
      </Alert>
      <div className="mb-4">
        {rows.length === 0 ? (
          <div className="rounded-lg bg-[#f9fafb] px-4 py-5 text-center dark:bg-[#1f1f22]" role="status">
            <p className="m-0 text-[13px] font-medium">You’re all caught up</p>
            <p className="m-0 mt-1 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">New manual, email, card, and wallet transactions will appear here.</p>
          </div>
        ) : (
          <HeroTable variant="primary" className="text-[13px]">
            <HeroTable.ScrollContainer>
              <HeroTable.Content aria-label="Transactions waiting for approval">
                <HeroTable.Header>
                  <HeroTable.Column className="w-10 px-2 py-2"><input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(rows.map((row) => row.id)))} aria-label="Select all transactions to review" className="size-4 accent-[#4a55c9]" /></HeroTable.Column>
                  <HeroTable.Column isRowHeader className="px-2 py-2 font-medium">Transaction</HeroTable.Column>
                  <HeroTable.Column className="px-2 py-2 font-medium">AI suggestion</HeroTable.Column>
                  <HeroTable.Column className="px-2 py-2 font-medium">Source</HeroTable.Column>
                  <HeroTable.Column className="px-2 py-2 text-right font-medium">Amount</HeroTable.Column>
                  <HeroTable.Column className="px-2 py-2 text-right font-medium">Action</HeroTable.Column>
                </HeroTable.Header>
                <HeroTable.Body>
                  {rows.map((row) => {
                    const meta = categoryMeta(row.category, row.categoryName);
                    const SourceIcon = SOURCE_ICON[row.source];
                    const suggestedId = categories.some((c) => c.id === row.categoryId) ? row.categoryId : undefined;
                    return <HeroTable.Row key={row.id} id={row.id} className="border-b border-[#f1efeb] last:border-0 dark:border-[#26262a]">
                      <HeroTable.Cell className="px-2 py-3"><input type="checkbox" checked={checked.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select row: ${row.name}`} className="size-4 accent-[#4a55c9]" /></HeroTable.Cell>
                      <HeroTable.Cell className="px-2 py-3"><span className="block font-medium">{row.name}</span><span className="block text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">{row.account} · {row.date.slice(5).replace("-", "/")}</span></HeroTable.Cell>
                      <HeroTable.Cell className="px-2 py-3">
                        {categories.length > 0 ? (
                          <Select
                            value={overrides[row.id] ?? suggestedId}
                            onValueChange={(value) => setOverride(row.id, value ?? suggestedId ?? null)}
                          >
                            <SelectTrigger aria-label={`Category for ${row.name}`} className="h-7 min-w-36 bg-white dark:bg-[#232327] text-[12px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.emoji} {option.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.pill}`}><span aria-hidden="true">{meta.emoji}</span>{meta.label}</span>
                        )}
                        <span className="ml-2 text-[11px] text-[#8a8b91] dark:text-[#a2a3a8]">{row.taxable ? "Taxable" : "Non-tax"} · {row.parse.confidence}%{overrides[row.id] ? " · edited" : ""}</span>
                      </HeroTable.Cell>
                      <HeroTable.Cell className="px-2 py-3"><span className="inline-flex items-center gap-1.5 text-[12px] text-[#6b6d72] dark:text-[#a2a3a8]" title={SOURCE_LABEL[row.source]}><SourceIcon />{SOURCE_LABEL[row.source]}</span></HeroTable.Cell>
                      <HeroTable.Cell className={`mono px-2 py-3 text-right font-medium tabular-nums ${row.needsManualReview ? "text-muted-foreground" : row.amount >= 0 ? "text-[#00afb9]" : "text-[#ef476f]"}`}>{row.needsManualReview ? "Not extracted" : <>{row.amount >= 0 ? "+" : "−"}{formatUSD(Math.abs(row.amount))}</>}</HeroTable.Cell>
                      <HeroTable.Cell className="px-2 py-3"><div className="flex justify-end gap-1">{!row.needsManualReview ? <><Button variant="ghost" size="icon-sm" onClick={() => onEdit(row.id)} aria-label={`Edit ${row.name}`} title="Edit before approving"><PencilSimple size={15} /></Button><Button variant="secondary" size="small" onClick={() => approve([row.id])}><CheckIcon /> Approve</Button></> : null}<Button variant="ghost" size="small" className="text-destructive hover:text-destructive" onClick={() => onDecline([row.id])}><CloseSmallIcon /> Decline</Button></div></HeroTable.Cell>
                    </HeroTable.Row>;
                  })}
                </HeroTable.Body>
              </HeroTable.Content>
            </HeroTable.ScrollContainer>
          </HeroTable>
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
            role="toolbar"
            aria-label={`${checked.size} review transactions selected`}
          >
            <div className="flex items-center gap-2 rounded-full bg-[#17181c] py-2 pr-2 pl-4 text-white shadow-[0_16px_48px_rgba(23,24,28,0.3)]">
              <p className="m-0 text-[13px] font-medium whitespace-nowrap" aria-live="polite">
                {checked.size} selected
              </p>
              <Button variant="ghost" size="small" onClick={() => { onDecline([...checked]); setChecked(new Set()); }} className="rounded-full text-white hover:bg-white/10 hover:text-white">
                <CloseSmallIcon /> Decline
              </Button>
              <Button variant="secondary" size="small" onClick={() => approve([...checked])} className="rounded-full">
                <CheckIcon /> Approve
              </Button>
              <button
                type="button"
                onClick={() => setChecked(new Set())}
                aria-label="Clear selection"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full text-white/70 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
              >
                <CloseSmallIcon />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
