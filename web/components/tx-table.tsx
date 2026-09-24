"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { Table as HeroTable } from "@heroui/react";
import { Button } from "./ui/button";
import { ConfirmButton } from "./confirm-button";
import {
  CalendarIcon,
  CaretDownIcon,
  CheckIcon,
  CloseSmallIcon,
  DollarIcon,
  FilterIcon,
  PlusIcon,
  ReceiptIcon,
  SearchIcon,
  SortDownIcon,
  SortUpIcon,
  TagIcon,
  UploadIcon,
} from "./icons";
import { formatUSD } from "@/lib/format";
import {
  categoryMeta,
  dayLabel,
  downloadTransactions,
  type DateFilter,
  type SortDir,
  type SortKey,
  type SourceFilter,
  type TaxFilter,
  type TxFull,
} from "@/lib/transactions";
import type { TxSource } from "@/lib/finance";
import { detectRecurringTransactions, MOCK_RECURRING_HISTORY } from "@/lib/recurring";
import { CardIcon, EmailIcon, FileIcon, ManualIcon, WalletIcon } from "./icons";

const PAGE_SIZE = 12;

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

const DATE_LABEL: Record<DateFilter, string> = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function cutoff(filter: DateFilter): string {
  const base = new Date("2026-09-18T12:00:00");
  if (filter === "7d") base.setDate(base.getDate() - 7);
  if (filter === "30d") base.setDate(base.getDate() - 30);
  if (filter === "90d") base.setDate(base.getDate() - 90);
  return base.toISOString().slice(0, 10);
}

function SortIcon({ dir, active }: { dir: SortDir; active: boolean }) {
  const Icon = dir === "asc" ? SortUpIcon : SortDownIcon;
  return (
    <span className={active ? "text-[#4a55c9] dark:text-[#9aa1f0]" : "text-[#c4c2bc] dark:text-[#55565c]"}>
      <Icon />
    </span>
  );
}

type MenuDim = "category" | "date" | "tax" | "source" | "sort" | null;

function MenuRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: (props: { className?: string }) => React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-[7px] text-left outline-none transition-colors hover:bg-[#f1efeb] dark:hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-[#4a55c9]"
    >
      <span className="shrink-0 text-[#55565c] dark:text-[#a2a3a8]">
        <Icon />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1c1d20] dark:text-[#eceef0]">
        {label}
      </span>
      {value ? (
        <span className="max-w-28 truncate text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">{value}</span>
      ) : null}
      <span aria-hidden="true" className="inline-flex shrink-0 -rotate-90 text-[#8a8b91] dark:text-[#a2a3a8]">
        <CaretDownIcon />
      </span>
    </button>
  );
}

function MenuOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
    className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[7px] text-left text-[13px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[#4a55c9] ${
      selected
        ? "bg-black/[0.06] dark:bg-[#18181A]"
        : "hover:bg-[#f1efeb] dark:hover:bg-white/[0.06]"
    }`}
  >
    <span className="flex size-4 shrink-0 items-center">
      {selected ? (
        <CheckIcon className="text-[#4a55c9] dark:text-[#c7cbf5]" />
      ) : null}
    </span>
    <span className="min-w-0 flex-1 truncate font-medium text-[#1c1d20] dark:text-[#eceef0]">
      {label}
    </span>
    </button>
  );
}

export interface MonthOption {
  value: string;
  label: string;
}

export interface TableCategoryOption {
  id: string;
  name: string;
  emoji: string;
}

interface TxTableProps {
  rows: TxFull[];
  categoryOptions: TableCategoryOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onImport: () => void;
  month: string;
  monthOptions: MonthOption[];
  onMonthChange: (value: string) => void;
}

/**
 * Transactions on the shadcn Table foundation, morphed to Rift Labs:
 * muted header row, hairline separators, right-aligned Mono amounts.
 * Filters live inside the search bar; active filters surface as pills
 * with live spent / income / net totals across the result set.
 */
export function TxTable({ rows, selectedId, onSelect, onEdit, onDelete, onImport, month, monthOptions, onMonthChange, categoryOptions }: TxTableProps) {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [tax, setTax] = useState<TaxFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [dateRange, setDateRange] = useState<DateFilter>("all");
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuDim>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const reduce = useReducedMotion() ?? false;
  const recurringPatterns = useMemo(() => detectRecurringTransactions([...MOCK_RECURRING_HISTORY, ...rows]), [rows]);
  const recurringByTransactionId = useMemo(
    () => new Map(recurringPatterns.flatMap((pattern) => pattern.transactions.map((transaction) => [transaction.id, pattern] as const))),
    [recurringPatterns]
  );

  useEffect(() => {
    setPage(1);
  }, [query, categories, tax, source, dateRange, recurringOnly]);

  // Prune selections for rows that no longer exist (e.g. after delete).
  useEffect(() => {
    setChecked((prev) => {
      const ids = new Set(rows.map((t) => t.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cut = dateRange === "all" ? null : cutoff(dateRange);
    const out = rows.filter((t) => {
      if (q && !`${t.name} ${t.account} ${categoryMeta(t.categoryId ?? t.category, t.categoryName).label}`.toLowerCase().includes(q)) return false;
      if (categories.length > 0 && !categories.includes(t.categoryId ?? t.category)) return false;
      if (tax === "taxable" && !t.taxable) return false;
      if (tax === "nontaxable" && t.taxable) return false;
      if (source !== "all" && t.source !== source) return false;
      if (recurringOnly && !recurringByTransactionId.has(t.id)) return false;
      if (cut && t.date < cut) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      if (sortKey === "amount") return (a.amount - b.amount) * dir;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir;
    });
  }, [rows, query, categories, tax, source, dateRange, recurringOnly, recurringByTransactionId, sortKey, sortDir]);

  const totals = useMemo(() => {
    let spent = 0;
    let income = 0;
    for (const t of filtered) {
      if (t.amount >= 0) income += t.amount;
      else spent += Math.abs(t.amount);
    }
    return { spent, income, net: income - spent };
  }, [filtered]);

  const optionName = (id: string) => categoryOptions.find((o) => o.id === id)?.name ?? categoryMeta(id, undefined).label;
  const pills: { key: string; label: string; clear: () => void }[] = [
    ...categories.map((c) => ({
      key: `cat-${c}`,
      label: optionName(c),
      clear: () => toggleCategory(c),
    })),
  ];
  if (tax !== "all")
    pills.push({ key: "tax", label: tax === "taxable" ? "Taxable" : "Non-taxable", clear: () => setTax("all") });
  if (source !== "all")
    pills.push({ key: "src", label: SOURCE_LABEL[source], clear: () => setSource("all") });
  if (dateRange !== "all")
    pills.push({ key: "date", label: DATE_LABEL[dateRange], clear: () => setDateRange("all") });
  if (recurringOnly)
    pills.push({ key: "recurring", label: "Recurring", clear: () => setRecurringOnly(false) });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const toggleCategory = (id: string) => {
    setCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const resetAll = () => {
    setCategories([]);
    setTax("all");
    setSource("all");
    setDateRange("all");
    setRecurringOnly(false);
    setMenu(null);
  };

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = slice.map((t) => t.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => checked.has(id));
  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const from = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const to = Math.min(safePage * PAGE_SIZE, filtered.length);
  return (
    <div>
      {/* Search with filters inside */}
      <div className="flex items-center justify-end gap-2">
        <Select value={month} onValueChange={(v) => onMonthChange(v ?? "all")}>
          <SelectTrigger aria-label="Filter by month" className="h-8 w-36 bg-white dark:bg-[#232327] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-44">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[#8a8b91] dark:text-[#a2a3a8]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search transactions"
            className="h-8 border-[#e9e7e2] dark:border-[#2d2d31] bg-white dark:bg-[#232327] pr-10 pl-8 text-[13px] focus-visible:border-[#e0ddd7] focus-visible:ring-0"
          />
          <Popover open={filterOpen} onOpenChange={(open) => { setFilterOpen(open); if (!open) setMenu(null); }}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`Filters${pills.length > 0 ? `, ${pills.length} active` : ""}`}
                  title="Filters"
                  className="absolute top-1/2 right-1 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-[#8a8b91] dark:text-[#a2a3a8] outline-none transition-colors hover:bg-[#f1efeb] dark:hover:bg-white/[0.06] hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9]"
                >
                  <FilterIcon />
                  {pills.length > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#4a55c9] text-[10px] font-semibold text-white"
                    >
                      {pills.length}
                    </span>
                  ) : null}
                </button>
              }
            />
            <PopoverContent align="end" className="w-64 p-1.5">
              {menu === null ? (
                <div role="menu" aria-label="Transaction filters">
                  <p className="m-0 px-2 pt-1 pb-0.5 text-[12px] font-semibold text-[#8a8b91] dark:text-[#a2a3a8]">Filter by</p>
                  <MenuRow icon={TagIcon} label="Category" value={categories.length === 1 ? optionName(categories[0]) : categories.length > 1 ? `${categories.length} selected` : undefined} onClick={() => setMenu("category")} />
                  <MenuRow icon={CalendarIcon} label="Date" value={dateRange !== "all" ? DATE_LABEL[dateRange] : undefined} onClick={() => setMenu("date")} />
                  <MenuRow icon={CalendarIcon} label="Recurring" value={recurringOnly ? "Detected" : undefined} onClick={() => setRecurringOnly((current) => !current)} />
                  <MenuRow icon={ReceiptIcon} label="Tax status" value={tax !== "all" ? (tax === "taxable" ? "Taxable" : "Non-taxable") : undefined} onClick={() => setMenu("tax")} />
                  <MenuRow icon={UploadIcon} label="Source" value={source !== "all" ? SOURCE_LABEL[source] : undefined} onClick={() => setMenu("source")} />
                  <div className="my-1 border-t border-[#f1efeb] dark:border-[#26262a]" />
                  <p className="m-0 px-2 pt-1 pb-0.5 text-[12px] font-semibold text-[#8a8b91] dark:text-[#a2a3a8]">Sort by</p>
                  <MenuRow icon={CalendarIcon} label="Date" value={sortKey === "date" ? (sortDir === "asc" ? "Oldest" : "Newest") : undefined} onClick={() => { toggleSort("date"); }} />
                  <MenuRow icon={DollarIcon} label="Amount" value={sortKey === "amount" ? (sortDir === "asc" ? "Lowest" : "Highest") : undefined} onClick={() => { toggleSort("amount"); }} />
                  <div className="my-1 border-t border-[#f1efeb] dark:border-[#26262a]" />
                  <button
                    type="button"
                    onClick={resetAll}
                    disabled={pills.length === 0}
                    className="w-full cursor-pointer rounded-md px-2 py-[7px] text-left text-[13px] text-[#8a8b91] dark:text-[#a2a3a8] outline-none transition-colors hover:bg-[#f1efeb] dark:hover:bg-white/[0.06] hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8a8b91]"
                  >
                    Reset all
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => setMenu(null)}
                    aria-label="Back to filters"
                    className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-[7px] text-left text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8] outline-none transition-colors hover:bg-[#f1efeb] dark:hover:bg-white/[0.06] hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9]"
                  >
                    <span aria-hidden="true" className="inline-flex rotate-90">
                      <CaretDownIcon />
                    </span>
                    {menu === "category" ? "Category" : menu === "date" ? "Date" : menu === "tax" ? "Tax status" : menu === "sort" ? "Sort by" : "Source"}
                  </button>
                  <div role="group" aria-label="Filter options" className="mt-0.5">
                    {menu === "category" ? (
                      <>
                        {categoryOptions.map((c) => (
                          <MenuOption key={c.id} label={`${c.emoji} ${c.name}`} selected={categories.includes(c.id)} onClick={() => toggleCategory(c.id)} />
                        ))}
                      </>
                    ) : null}
                    {menu === "date" ? (
                      <>
                        {(Object.keys(DATE_LABEL) as DateFilter[]).map((d) => (
                          <MenuOption key={d} label={DATE_LABEL[d]} selected={dateRange === d} onClick={() => setDateRange(d)} />
                        ))}
                      </>
                    ) : null}
                    {menu === "tax" ? (
                      <>
                        <MenuOption label="All tax states" selected={tax === "all"} onClick={() => setTax("all")} />
                        <MenuOption label="Taxable" selected={tax === "taxable"} onClick={() => setTax("taxable")} />
                        <MenuOption label="Non-taxable" selected={tax === "nontaxable"} onClick={() => setTax("nontaxable")} />
                      </>
                    ) : null}
                    {menu === "source" ? (
                      <>
                        <MenuOption label="All sources" selected={source === "all"} onClick={() => setSource("all")} />
                        {(Object.keys(SOURCE_LABEL) as SourceFilter[]).filter((s) => s !== "all").map((s) => (
                          <MenuOption key={s} label={SOURCE_LABEL[s]} selected={source === s} onClick={() => setSource(s)} />
                        ))}
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </PopoverContent>
            </Popover>
        </div>
        <Button
          variant="primary"
          onClick={onImport}
        >
          <UploadIcon />
          Import
        </Button>
      </div>

      {/* Active filter pills + live totals */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-live="polite">
          {pills.length === 0 ? (
            <span className="text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">All transactions</span>
          ) : (
            <>
              {pills.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={p.clear}
                  aria-label={`Clear filter: ${p.label}`}
                  className="inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-full border border-[#C7D2FE] bg-[#E0E7FF] pr-1.5 pl-2.5 text-[12px] font-semibold text-[#4338CA] outline-none transition-colors hover:bg-[#C7D2FE] focus-visible:outline-2 focus-visible:outline-[#4a55c9] dark:border-[#4a55c9] dark:bg-[#23264a] dark:text-[#c7cbf5] dark:hover:bg-[#2e3370]"
                >
                  {p.label}
                  <CloseSmallIcon />
                </button>
              ))}
              <Button variant="ghost" size="small" onClick={() => setFilterOpen(true)}>
                <PlusIcon />
                Add filter
              </Button>
            </>
          )}
        </div>
        <p className="mono m-0 text-[12px] tabular-nums" aria-live="polite">
          <span className="text-[#8a8b91] dark:text-[#a2a3a8]">Spent </span>
          <span className="font-semibold text-[#1c1d20] dark:text-[#eceef0]">{formatUSD(totals.spent)}</span>
          <span className="text-[#8a8b91] dark:text-[#a2a3a8]"> · Income </span>
          <span className="font-semibold text-[#35754e] dark:text-[#4cc38a]">{formatUSD(totals.income)}</span>
          <span className="text-[#8a8b91] dark:text-[#a2a3a8]"> · Net </span>
          <span className={`font-semibold ${totals.net >= 0 ? "text-[#35754e] dark:text-[#4cc38a]" : "text-[#b0402f] dark:text-[#e0684f]"}`}>
            {totals.net >= 0 ? "+" : "−"}{formatUSD(Math.abs(totals.net))}
          </span>
        </p>
      </div>

      {/* Table */}
      <div className="mt-3">
        <HeroTable variant="primary" className="text-[13px]">
          <HeroTable.ScrollContainer>
            <HeroTable.Content aria-label="Ledger transactions">
          <HeroTable.Header>
            <HeroTable.Column className="w-10 px-3 py-2">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all transactions on this page" className="block size-4 accent-[#4a55c9]" />
            </HeroTable.Column>
            <HeroTable.Column id="name" isRowHeader allowsSorting className="px-3 py-2 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">
              <button type="button" onClick={() => toggleSort("name")} className="flex cursor-pointer items-center gap-1 rounded outline-none hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9]">Transaction <SortIcon dir={sortKey === "name" ? sortDir : "desc"} active={sortKey === "name"} /></button>
            </HeroTable.Column>
            <HeroTable.Column className="px-3 py-2 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">Category</HeroTable.Column>
            <HeroTable.Column className="px-3 py-2 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">Tax</HeroTable.Column>
            <HeroTable.Column className="px-3 py-2 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">Source</HeroTable.Column>

            <HeroTable.Column id="amount" allowsSorting className="px-3 py-2 text-right text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">
              <button type="button" onClick={() => toggleSort("amount")} className="ml-auto flex cursor-pointer items-center gap-1 rounded outline-none hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9]">Amount <SortIcon dir={sortKey === "amount" ? sortDir : "desc"} active={sortKey === "amount"} /></button>
            </HeroTable.Column>
          </HeroTable.Header>
          <HeroTable.Body>
            {slice.map((t, index) => {
              const meta = categoryMeta(t.categoryId ?? t.category, t.categoryName);
              const SIcon = SOURCE_ICON[t.source];
              const income = t.amount >= 0;
              const selected = t.id === selectedId;
              const day = dayLabel(t.date);
              const previousDay = index > 0 ? dayLabel(slice[index - 1].date) : null;
              const showDay = sortKey === "date" && day !== previousDay;
              return (
                <Fragment key={t.id}>
                  {showDay ? (
                    <HeroTable.Row id={`${t.id}-date`} className="border-b border-line bg-background hover:bg-background">
                      <HeroTable.Cell colSpan={6} className="px-3 py-1.5 text-[12px] font-medium text-[#8a8b91] dark:text-[#a2a3a8]">{day}</HeroTable.Cell>
                    </HeroTable.Row>
                  ) : null}
                  <HeroTable.Row id={t.id} onAction={() => onSelect(t.id)} onDoubleClick={() => onEdit(t.id)} className={`cursor-pointer border-b border-[#f1efeb] dark:border-[#26262a] hover:bg-secondary ${selected ? "bg-[#eceefb]/60 dark:bg-[#23264a]/60 hover:bg-[#eceefb] dark:hover:bg-[#23264a]" : ""}`}>
                    <HeroTable.Cell className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.has(t.id)} onChange={() => toggleCheck(t.id)} aria-label={`Select row: ${t.name}`} className="block size-4 accent-[#4a55c9]" /></HeroTable.Cell>
                    <HeroTable.Cell className="max-w-56 px-3 py-2.5"><span className="block truncate font-medium text-[#1c1d20] dark:text-[#eceef0]">{t.name}</span><span className="block truncate text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">{t.account} · {t.date.slice(5).replace("-", "/")}</span>{recurringByTransactionId.get(t.id) ? <span className="mt-0.5 block truncate text-[11px] font-medium text-[#4a55c9] dark:text-[#9aa1f0]">Recurring · next {new Date(`${recurringByTransactionId.get(t.id)!.nextDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {formatUSD(recurringByTransactionId.get(t.id)!.amount)}</span> : null}</HeroTable.Cell>
                    <HeroTable.Cell className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap ${meta.pill}`}><span aria-hidden="true" className="text-[11px]">{meta.emoji}</span>{meta.label}</span></HeroTable.Cell>
                    <HeroTable.Cell className="px-3 py-2.5"><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${t.taxable ? "border-transparent bg-[#a2d2ff] text-white" : "border-transparent bg-[#cdb4db] text-white"}`}>{t.taxable ? "Taxable" : "Non-tax"}</span></HeroTable.Cell>
                    <HeroTable.Cell className="px-3 py-2.5"><span title={SOURCE_LABEL[t.source]} aria-label={SOURCE_LABEL[t.source]} className="flex size-7 items-center justify-center rounded-md bg-[#f1efeb] dark:bg-[#26262a] text-[#55565c] dark:text-[#a2a3a8]"><SIcon /></span></HeroTable.Cell>

                    <HeroTable.Cell className={`mono px-3 py-2.5 text-right font-medium tabular-nums ${income ? "text-[#00afb9]" : "text-[#ef476f]"}`}>{income ? "+" : "−"}{formatUSD(Math.abs(t.amount))}</HeroTable.Cell>
                  </HeroTable.Row>
                </Fragment>
              );
            })}
            {slice.length === 0 ? <HeroTable.Row id="empty"><HeroTable.Cell colSpan={6} className="px-3 py-10 text-center"><p className="m-0 text-[13px] font-medium text-[#1c1d20] dark:text-[#eceef0]">No transactions match</p><p className="m-0 mt-1 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">Try widening the search or clearing a filter</p></HeroTable.Cell></HeroTable.Row> : null}
          </HeroTable.Body>
            </HeroTable.Content>
          </HeroTable.ScrollContainer>
        </HeroTable>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
          Showing {from}–{to} of {filtered.length}
        </p>
        <div className="flex items-center gap-2">
          <span className="sr-only" aria-live="polite">
            Page {safePage} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="small"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="small"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
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
            aria-label={`${checked.size} transactions selected`}
          >
            <div className="flex items-center gap-2 rounded-full bg-[#17181c] py-2 pr-2 pl-4 text-white shadow-[0_16px_48px_rgba(23,24,28,0.3)]">
              <p className="m-0 text-[13px] font-medium whitespace-nowrap" aria-live="polite">
                {checked.size} selected
              </p>
              <Button
                variant="secondary"
                size="small"
                onClick={() => downloadTransactions(rows.filter((t) => checked.has(t.id)))}
                className="rounded-full"
              >
                Export
              </Button>
              <ConfirmButton onConfirm={() => onDelete([...checked])}>
                Delete
              </ConfirmButton>
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
    </div>
  );
}
