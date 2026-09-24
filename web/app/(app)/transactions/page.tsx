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
import { toast } from "@/components/ui/toast";

type ApiTransaction = {
  id: string;
  description: string;
  merchant?: string | null;
  amount: number | string;
  displayAmount?: number;
  currency?: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  occurredAt: string;
  source?: string | null;
  isTaxable: boolean;
  needsReview: boolean;
  account?: { name: string } | null;
  category?: { id: string; name: string } | null;
};

type ApiReview = {
  id: string;
  rowNumber: number;
  status: string;
  rawData: Record<string, unknown>;
  errorMessage?: string | null;
  displayAmount?: number;
  displayCurrency?: string;
  proposedData?: { type?: string; amount?: number; currency?: string; categoryId?: string; categoryName?: string; description?: string; occurredAt?: string } | null;
};

function categoryId(name?: string | null) {
  const normalized = (name ?? "other").toLowerCase();
  return ["groceries", "housing", "utilities", "transport", "dining", "shopping", "education", "income", "investments", "other"].find((id) => normalized.includes(id)) ?? "other";
}

function sourceId(source?: string | null): TxFull["source"] {
  return source === "email" || source === "card" || source === "wallet" || source === "manual" ? source : "manual";
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
    currency: item.currency,
    category: categoryId(item.category?.name),
    categoryId: item.category?.id,
    taxable: item.isTaxable,
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
  return {
    id: item.id,
    name: proposed?.description || (raw.needsReview && typeof raw.page === "number" ? `Statement page ${raw.page} needs review` : rawDescription || "Imported transaction"),
    account: "Imported",
    date: (proposed?.occurredAt || rawDate || new Date().toISOString()).slice(0, 10),
    amount: proposed?.type === "INCOME" ? Math.abs(amount) : -Math.abs(amount),
    sourceAmount: Number(proposed?.amount ?? raw.amount ?? raw.total ?? 0),
    currency: proposed?.currency ?? (typeof raw.currency === "string" ? raw.currency : undefined),
    needsManualReview: Boolean(raw.needsReview && !proposed),
    category: categoryId(item.proposedData?.categoryName),
    categoryId: item.proposedData?.categoryId,
    taxable: false,
    source: "manual",
    parse: { state: "review", confidence: 90 },
    note: item.errorMessage || `Import row ${item.rowNumber}`, 
  };
}

function TransactionsInner() {
  const [rows, setRows] = useState<TxFull[]>([]);
  const [reviewRows, setReviewRows] = useState<TxFull[]>([]);
  const [view, setView] = useState<"ledger" | "review">("review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (importModal === "import") {
      setImportOpen(true);
      router.replace("/transactions");
    }
  }, [importModal, router]);

  const selected = rows.find((t) => t.id === selectedId) ?? null;
  const editing = rows.find((t) => t.id === editId) ?? reviewRows.find((t) => t.id === editId) ?? null;

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const save = async (next: TxFull) => {
    try {
      const response = await api.patch<{ data: ApiTransaction }>(`/v1/transactions/${next.id}`, {
        type: next.amount >= 0 ? "INCOME" : "EXPENSE",
        amount: Math.abs(next.sourceAmount ?? next.amount),
        currency: next.currency,
        description: next.name,
        occurredAt: next.date,
        source: next.source,
        categoryId: categoryIds[next.category] ?? next.categoryId ?? null,
        isTaxable: next.taxable,
      });
      const mapped = mapTransaction(response.data);
      setRows((prev) => prev.map((t) => (t.id === next.id ? mapped : t)));
      setReviewRows((prev) => prev.map((t) => (t.id === next.id ? mapped : t)));
    } catch {
      setRows((prev) => prev.map((t) => (t.id === next.id ? next : t)));
      setReviewRows((prev) => prev.map((t) => (t.id === next.id ? next : t)));
    }
  };

  const declineReview = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => api.post(`/v1/reviews/${id}/reject`, {})));
      setReviewRows((prev) => prev.filter((item) => !ids.includes(item.id)));
      toast.success(ids.length === 1 ? "Transaction declined" : `${ids.length} transactions declined`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not decline these transactions.");
      const response = await api.get<{ data: ApiReview[] }>("/v1/reviews?status=PENDING");
      setReviewRows(response.data.map(mapReview));
    }
  };

  const approveReview = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => api.post(`/v1/reviews/${id}/approve`, {})));
      setReviewRows((prev) => prev.filter((transaction) => !ids.includes(transaction.id)));
      setRows((await fetchAllTransactions(month)).map(mapTransaction));
    } catch {
      const approved = reviewRows
        .filter((transaction) => ids.includes(transaction.id))
        .map((transaction) => ({ ...transaction, parse: { state: "parsed" as const, confidence: transaction.parse.confidence ?? 100 } }));
      setRows((prev) => [...approved, ...prev]);
      setReviewRows((prev) => prev.filter((transaction) => !ids.includes(transaction.id)));
    }
    setView("ledger");
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
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="inline-flex w-56 items-center rounded-full bg-paper-100 p-1 dark:bg-paper-200" role="tablist" aria-label="Transaction views">
            <button type="button" role="tab" aria-selected={view === "review"} onClick={() => setView("review")} className={`h-8 w-1/2 rounded-full px-3 text-[12px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-ring ${view === "review" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>To review <span className="ml-1 text-[11px]">{reviewRows.length}</span></button>
            <button type="button" role="tab" aria-selected={view === "ledger"} onClick={() => setView("ledger")} className={`h-8 w-1/2 rounded-full px-3 text-[12px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-ring ${view === "ledger" ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Ledger</button>
          </div>
          {view === "review" ? <p className="m-0 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">Approve items to add them to Ledger</p> : null}
        </div>
        {view === "review" ? <ReviewQueue rows={reviewRows} onApprove={approveReview} onDecline={declineReview} onEdit={setEditId} /> : <>
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
      />
      <TxImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={addRows}
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
