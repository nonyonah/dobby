"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { TxTable } from "@/components/tx-table";
import { TxDetail } from "@/components/tx-detail";
import { TxEditDialog } from "@/components/tx-edit-dialog";
import { TxImportDialog } from "@/components/tx-import-dialog";
import { ReviewQueue } from "@/components/review-queue";


import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TxFull } from "@/lib/transactions";
import { useApi } from "@/hooks/use-api";
import { ApiError } from "@/lib/api-client";
import { useCategories } from "@/hooks/use-categories";
import { TX_CATEGORIES } from "@/lib/transactions";
import { toast } from "@/components/ui/toast";
import { guidanceFor, guidanceText } from "@/lib/error-guidance";
import { requestAttentionSync } from "@/hooks/use-attention";
import { Segmented } from "@/components/ui/segmented";

/** Approvals go out in small sequential chunks: one bulk request beats N
 * concurrent single approves (which starved the connection pool), and a
 * stalled chunk fails only its own rows instead of aborting everything. */
const APPROVE_CHUNK = 25;

/**
 * Shown on a password-locked attachment. Dobby never asks for the password and
 * cannot read the file, so this row has exactly one route to resolution:
 * download an unlocked copy from the mail app and import it directly. That is
 * why the row carries no Approve action — there is nothing to approve here.
 */
const LOCKED_ATTACHMENT_NOTE =
  "Password-locked — open the email and download an unlocked copy, then import it here.";

type ApiTransaction = {
  id: string;
  description: string;
  merchant?: string | null;
  amount: number | string;
  displayAmount?: number;
  displayCurrency?: string;
  currency?: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  occurredAt: string;
  source?: string | null;
  isTaxable: boolean;
  needsReview: boolean;
  subAccount?: string | null;
  reference?: string | null;
  transferSource?: string | null;
  transferDirection?: string | null;
  account?: { name: string } | null;
  category?: { id: string; name: string; color?: string | null } | null;
};

type ApiReview = {
  id: string;
  rowNumber: number;
  status: string;
  rawData: Record<string, unknown>;
  errorMessage?: string | null;
  displayAmount?: number;
  displayCurrency?: string;
  needsPassword?: boolean;
  /** Derived server-side: the tax rules could not resolve this inflow. */
  needsTaxAnswer?: boolean;
  transferSource?: string | null;
  transferDirection?: string | null;
  subAccount?: string | null;
  proposedData?: { type?: string; amount?: number; currency?: string; categoryId?: string; categoryName?: string; description?: string; occurredAt?: string; isTaxable?: boolean | null } | null;
};

function categoryId(name?: string | null) {
  const normalized = (name ?? "other").toLowerCase();
  return ["groceries", "housing", "utilities", "transport", "dining", "shopping", "education", "income", "investments", "other"].find((id) => normalized.includes(id)) ?? "other";
}

function sourceId(source?: string | null): TxFull["source"] {
  return source === "email" || source === "card" || source === "wallet" || source === "manual" || source === "statement" || source === "receipt" ? source : "manual";
}

function mapTransaction(item: ApiTransaction): TxFull {
  const amount = Number(item.displayAmount ?? item.amount) * (item.type === "EXPENSE" ? -1 : 1);
  return {
    id: item.id,
    name: item.merchant || item.description,
    account: item.account?.name ?? "Unassigned",
    date: item.occurredAt.slice(0, 10),
    amount,
    sourceAmount: Number(item.amount),
    displayCurrency: item.displayCurrency,
    currency: item.currency,
    category: item.category?.id ?? categoryId(item.category?.name),
    categoryId: item.category?.id,
    categoryName: item.category?.name ?? undefined,
    categoryColor: item.category?.color ?? null,
    kind: item.type,
    taxable: item.isTaxable,
    transferSource: item.transferSource === "reference" || item.transferSource === "pattern" || item.transferSource === "name" ? item.transferSource : null,
    transferDirection: item.transferDirection === "IN" || item.transferDirection === "OUT" ? item.transferDirection : null,
    subAccount: item.subAccount ?? null,
    source: sourceId(item.source),
    parse: { state: item.needsReview ? "review" : "parsed" },
    note: "",
  };
}

function mapReview(item: ApiReview): TxFull {
  const proposed = item.proposedData;
  const raw = item.rawData ?? {};
  const rawDescription = typeof raw.description === "string" ? raw.description : typeof raw.merchant === "string" ? raw.merchant : undefined;
  const rawDate = typeof raw.date === "string" ? raw.date : undefined;
  const amount = Number(item.displayAmount ?? proposed?.amount ?? raw.amount ?? raw.total ?? 0);
  // A locked attachment carries no proposedData and no `needsReview` flag, so
  // the old expression rendered it as an ordinary approvable row — with a
  // working-looking Approve button that failed server-side every time it was
  // pressed. It is a row the user has to act on outside Dobby.
  const locked = item.needsPassword === true;
  const filename = typeof raw.filename === "string" ? raw.filename : null;
  return {
    id: item.id,
    name: proposed?.description
      || (locked ? `${filename ?? "Attachment"} is locked` : raw.needsReview && typeof raw.page === "number" ? `Statement page ${raw.page} needs review` : rawDescription || "Imported transaction"),
    account: locked ? "Locked attachment" : "Imported",
    date: (proposed?.occurredAt || rawDate || new Date().toISOString()).slice(0, 10),
    amount: proposed?.type === "INCOME" ? Math.abs(amount) : -Math.abs(amount),
    sourceAmount: Number(proposed?.amount ?? raw.amount ?? raw.total ?? 0),
    currency: proposed?.currency ?? (typeof raw.currency === "string" ? raw.currency : undefined),
    displayCurrency: item.displayCurrency,
    needsManualReview: locked || Boolean(raw.needsReview && !proposed),
    needsUnlocking: locked,
    // The server derived this rather than asking the model, and flags it as an
    // open question when the rules could not settle it.
    needsTaxAnswer: item.needsTaxAnswer === true,
    // Narrowed rather than cast: the API field is a string, and an unknown
    // value is better dropped than passed through into the union.
    transferSource: item.transferSource === "reference" || item.transferSource === "pattern" || item.transferSource === "name" ? item.transferSource : null,
    transferDirection: item.transferDirection === "IN" || item.transferDirection === "OUT" ? item.transferDirection : null,
    subAccount: item.subAccount ?? (typeof raw.subAccount === "string" ? raw.subAccount : null),
    category: categoryId(item.proposedData?.categoryName),
    categoryId: item.proposedData?.categoryId,
    categoryName: item.proposedData?.categoryName ?? undefined,
    // A transfer keeps its own type all the way to the table, where it is
    // excluded from income and spending. Collapsing it to EXPENSE here would put
    // it back in the totals it was just removed from.
    kind: proposed?.type === "TRANSFER" ? "TRANSFER" : proposed?.type === "INCOME" ? "INCOME" : "EXPENSE",
    taxable: proposed?.isTaxable === true,
    source: "manual",
    parse: { state: "review", confidence: 90 },
    note: locked ? LOCKED_ATTACHMENT_NOTE : item.errorMessage || `Import row ${item.rowNumber}`,
  };
}

function TransactionsInner() {
  const [rows, setRows] = useState<TxFull[]>([]);
  const [reviewRows, setReviewRows] = useState<TxFull[]>([]);
  const [approving, setApproving] = useState(false);
  const [approveProgress, setApproveProgress] = useState<string | null>(null);
  const [view, setView] = useState<"ledger" | "review">("review");
  // A "to review" deep link (from Needs attention / flags) opens the Review tab
  // on the target row without an effect-driven state sync.
  const deepLinkReview = useSearchParams().get("view") === "review";
  const effectiveView = deepLinkReview ? "review" : view;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});
  const { categories: liveCategories } = useCategories();
  const [month, setMonth] = useState("all");
  const isMobile = useIsMobile();
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();

  const monthOptions = useMemo(() => {
    const options = [{ value: "all", label: "All time" }];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      options.push({ value, label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) });
    }
    return options;
  }, []);

  const fetchAllTransactions = async (monthValue: string): Promise<ApiTransaction[]> => {
    const params = new URLSearchParams({ page: "1", pageSize: "100", sort: "occurredAt", direction: "desc" });
    if (monthValue !== "all") {
      const [y, m] = monthValue.split("-").map(Number);
      params.set("from", new Date(Date.UTC(y, m - 1, 1)).toISOString());
      params.set("to", new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString());
    }
    const first = await api.get<{ data: ApiTransaction[]; meta: { total: number } }>(`/v1/transactions?${params}`);
    const pages = Math.ceil(first.meta.total / 100);
    if (pages <= 1) return first.data;
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) => {
        const p = new URLSearchParams(params);
        p.set("page", String(i + 2));
        return api.get<{ data: ApiTransaction[] }>(`/v1/transactions?${p}`);
      })
    );
    return [...first.data, ...rest.flatMap((r) => r.data)];
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void Promise.all([
      api.get<{ data: ApiReview[] }>("/v1/reviews?status=PENDING"),
      api.get<{ data: Array<{ id: string; name: string; isArchived: boolean }> }>("/v1/categories"),
    ]).then(([reviewResponse, categoryResponse]) => {
      if (cancelled) return;
      setReviewRows(reviewResponse.data.map(mapReview));
      setCategoryIds(Object.fromEntries(categoryResponse.data.filter((category) => !category.isArchived).map((category) => [category.name.toLowerCase(), category.id])));
    }).catch(() => {
      if (!cancelled) {
        setReviewRows([]);
      }
    });
    return () => {
      cancelled = true;
    };
    // Static reference data loads once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void fetchAllTransactions(month).then((transactions) => {
      if (cancelled) return;
      setRows(transactions.map(mapTransaction));
      setSelectedId((current) => {
        if (current && transactions.some((t) => t.id === current)) return current;
        return transactions[0] ? transactions[0].id : null;
      });
    }).catch(() => {
      if (!cancelled) setRows([]);
    });
    return () => {
      cancelled = true;
    };
    // Only the ledger refetches when the month changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, month]);
  const params = useSearchParams();
  const router = useRouter();
  const importModal = params.get("modal");
  const focusId = params.get("focus");

  useEffect(() => {
    if (importModal === "import") {
      setImportOpen(true);
      router.replace("/transactions");
    }
  }, [importModal, router]);

  const categoryOptions =
    liveCategories.length > 0
      ? liveCategories
      : TX_CATEGORIES.map((c) => ({ id: c.id, name: c.label, emoji: c.emoji }));

  const selected = rows.find((t) => t.id === selectedId) ?? null;
  const editing = rows.find((t) => t.id === editId) ?? reviewRows.find((t) => t.id === editId) ?? null;

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const save = async (next: TxFull, opts?: { rememberRule?: boolean }) => {
    let mapped: TxFull | null = null;
    try {
      const liveIds = new Set(liveCategories.map((c) => c.id));
      const response = await api.patch<{ data: ApiTransaction }>(`/v1/transactions/${next.id}`, {
        type: next.kind ?? (next.amount >= 0 ? "INCOME" : "EXPENSE"),
        amount: Math.abs(next.sourceAmount ?? next.amount),
        currency: next.currency,
        description: next.name,
        occurredAt: next.date,
        source: next.source,
        categoryId: (next.categoryId && liveIds.has(next.categoryId) ? next.categoryId : null) ?? categoryIds[next.category] ?? null,
        isTaxable: next.taxable,
      });
      mapped = mapTransaction(response.data);
      setRows((prev) => prev.map((t) => (t.id === next.id ? mapped! : t)));
      setReviewRows((prev) => prev.map((t) => (t.id === next.id ? mapped! : t)));
    } catch (error) {
      // A lapsed trial locks edits server-side — say so instead of a generic failure.
      if (error instanceof ApiError && error.code === "UPGRADE_REQUIRED") {
        const guidance = guidanceFor(error, "trial");
        toast.error(guidance.title, { description: guidanceText(guidance) });
      } else {
        toast.error("Could not save this transaction. Try again.");
      }
      return;
    }
    // Offer kept: persist a rule so the same merchant/description self-categorizes next time.
    if (opts?.rememberRule && mapped?.categoryId) {
      const matcher = (next.name || "").trim().slice(0, 80);
      if (matcher) {
        try {
          await api.post("/v1/rules", { matcher, categoryId: mapped.categoryId, isTaxable: mapped.taxable });
          toast.success("Transaction updated — similar ones will categorize themselves from now on.");
          return;
        } catch {
          // Rule creation is a bonus; the save itself already landed.
        }
      }
    }
    toast.success("Transaction updated");
  };

  const declineReview = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => api.post(`/v1/reviews/${id}/reject`, {})));
      setReviewRows((prev) => prev.filter((item) => !ids.includes(item.id)));
      if (ids.length > 0) requestAttentionSync();
      toast.success(ids.length === 1 ? "Transaction declined" : `${ids.length} transactions declined`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not decline these transactions.");
      const response = await api.get<{ data: ApiReview[] }>("/v1/reviews?status=PENDING");
      setReviewRows(response.data.map(mapReview));
    }
  };

  const approveReview = async (ids: string[], overrides: Record<string, string> = {}, taxAnswers: Record<string, boolean> = {}) => {
    setApproving(true);
    const approved: string[] = [];
    const duplicates: string[] = [];
    const failed: Array<{ id: string; message: string }> = [];
    for (let index = 0; index < ids.length; index += APPROVE_CHUNK) {
      const chunk = ids.slice(index, index + APPROVE_CHUNK);
      if (ids.length > APPROVE_CHUNK) setApproveProgress(`Approving ${Math.min(index + APPROVE_CHUNK, ids.length)} of ${ids.length}…`);
      try {
        const response = await api.post<{ data: { approved: string[]; duplicates: string[]; failed: Array<{ id: string; message: string }> } }>(
          "/v1/reviews/approve-many",
          // The category and the tax answer ride along with the approval, so the
          // row lands correct rather than being approved on a null and corrected
          // later — which is what made manual edits look like they had not saved.
          { items: chunk.map((id) => ({
            id,
            ...(overrides[id] ? { categoryId: overrides[id] } : {}),
            ...(taxAnswers[id] !== undefined ? { isTaxable: taxAnswers[id] } : {}),
          })) },
          { timeoutMs: 120_000 },
        );
        approved.push(...response.data.approved);
        duplicates.push(...response.data.duplicates);
        failed.push(...response.data.failed);
      } catch {
        for (const id of ids.slice(index)) failed.push({ id, message: "Request did not complete." });
        break;
      }
    }
    const resolved = new Set([...approved, ...duplicates]);
    setReviewRows((prev) => prev.filter((transaction) => !resolved.has(transaction.id)));
    if (resolved.size > 0) requestAttentionSync();
    try {
      setRows((await fetchAllTransactions(month)).map(mapTransaction));
    } catch {
      // The ledger refreshes on the next visit; approvals already landed.
    }
    setApproving(false);
    setApproveProgress(null);
    if (failed.length > 0 && approved.length === 0 && duplicates.length === 0) {
      toast.error(ids.length === 1 ? "Could not approve this transaction." : "Could not approve these transactions.");
      return;
    }
    if (failed.length > 0) {
      toast.error(`${failed.length} of ${ids.length} could not be approved — the rest are done. Review the leftovers and retry.`);
      return;
    }
    toast.success(ids.length === 1 ? "Transaction approved" : `${resolved.size} transactions approved`);
    // Only leave the review tab once there is genuinely nothing left to decide.
    // Switching after a single approval dumped the user on the ledger, which
    // read as though the one click had approved the whole queue.
    if (Math.max(0, reviewRows.length - resolved.size) === 0) setView("ledger");
  };

  const remove = async (ids: string[]) => {
    try {
      const response = await api.post<{ data: { deletedCount: number } }>("/v1/transactions/bulk-delete", { ids });
      if (response.data.deletedCount !== ids.length) {
        throw new Error("Some transactions could not be deleted. Refreshing the ledger.");
      }
      setRows((prev) => prev.filter((t) => !ids.includes(t.id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the selected transactions.");
      const refreshed = await fetchAllTransactions(month);
      setRows(refreshed.map(mapTransaction));
      return;
    }
    setSelectedId((current) => (current && ids.includes(current) ? null : current));
    setDrawerOpen(false);
    toast.success(ids.length === 1 ? "Transaction deleted" : `${ids.length} transactions deleted`);
  };

  const addRows = async (incoming: TxFull[], file?: File, importType: "CSV" | "OFX" | "QFX" | "RECEIPT" = "CSV") => {
    if (!file || !isSignedIn) {
      setRows((prev) => [...incoming, ...prev]);
      return;
    }
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const contentType = file.type || (extension === "ofx" ? "application/ofx" : extension === "qfx" ? "application/qfx" : extension === "pdf" ? "application/pdf" : importType === "RECEIPT" ? "image/jpeg" : "text/csv");
      const presigned = await api.post<{ data: { import: { id: string }; uploadUrl: string } }>("/v1/imports/presign", {
        originalName: file.name,
        type: importType,
        contentType,
      });
      await api.put(`/v1/imports/${presigned.data.import.id}/file`, file, contentType);
      const processResponse = await api.post<{ data: { importId: string; jobId?: string; status?: string } }>(`/v1/imports/${presigned.data.import.id}/process`, {});
      const jobId = processResponse.data.jobId;
      if (jobId) {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const job = await api.get<{ data: { status: string; errorMessage?: string | null } }>(`/v1/imports/jobs/${jobId}`);
          if (job.data.status === "REVIEW" || job.data.status === "COMPLETED") break;
          if (job.data.status === "FAILED") throw new Error(job.data.errorMessage || "Import processing failed.");
          if (attempt === 119) throw new Error("Import is still processing. Check the import status and review queue shortly.");
        }
      }
      const reviews = await api.get<{ data: ApiReview[] }>("/v1/reviews?status=PENDING");
      setReviewRows(reviews.data.map(mapReview));
      setView("review");
    } catch (error) {
      throw error instanceof Error ? error : new Error("Could not process import.");
    }
  };

  return (
    <>
      <div className="w-full px-6 pt-6 pb-10">
        <div data-tour="transactions-views" className="mb-4 flex items-center justify-between gap-3">
          <Segmented
            label="Transaction views"
            value={effectiveView}
            onValueChange={setView}
            options={[
              { value: "review", label: "To review", count: reviewRows.length },
              { value: "ledger", label: "Ledger" },
            ]}
          />
          {effectiveView === "review" ? <p className="m-0 text-[12px] text-muted-foreground">Approve items to add them to Ledger</p> : null}
        </div>
        {effectiveView === "review" ? <ReviewQueue rows={reviewRows} categories={categoryOptions} onApprove={approveReview} onDecline={declineReview} onEdit={setEditId} busy={approving ? (approveProgress ?? true) : false} focusId={focusId ?? undefined} /> : <>
          <TxTable
            rows={rows}
            selectedId={selectedId}
            onSelect={openDetail}
            onEdit={setEditId}
            onDelete={remove}
            onImport={() => setImportOpen(true)}
            month={month}
            monthOptions={monthOptions}
            onMonthChange={setMonth}
            categoryOptions={categoryOptions}
          />
        </>}
      </div>
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        showSwipeHandle={isMobile}
        swipeDirection={isMobile ? "down" : "right"}
      >
        <DrawerContent className="[--drawer-content-width:min(25rem,calc(100vw-4rem))] sm:[--drawer-content-width:25rem]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Transaction details</DrawerTitle>
            <DrawerDescription>
              Category, tax status, source and parsing info for the selected transaction.
            </DrawerDescription>
          </DrawerHeader>
          <div className="scrollbar-hide flex-1 overflow-y-auto px-6 pt-2 pb-6">
          <TxDetail
            tx={selected}
            onClose={() => setDrawerOpen(false)}
            onEdit={() => selected && setEditId(selected.id)}
            onToggleBudget={(next) => void save(next)}
          />
          </div>
        </DrawerContent>
      </Drawer>
      <TxEditDialog
        tx={editing}
        open={editId !== null}
        onOpenChange={(open) => {
          if (!open) setEditId(null);
        }}
        onSave={save}
        categories={liveCategories}
      />
      <TxImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={addRows}
        categories={categoryOptions}
      />
    </>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsInner />
    </Suspense>
  );
}
