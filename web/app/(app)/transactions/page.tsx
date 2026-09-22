"use client";

import { Suspense, useEffect, useState } from "react";
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

type ApiTransaction = {
  id: string;
  description: string;
  merchant?: string | null;
  amount: number | string;
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
  rawData: Record<string, string>;
  proposedData?: { type?: string; amount?: number; description?: string; occurredAt?: string } | null;
};

function categoryId(name?: string | null) {
  const normalized = (name ?? "other").toLowerCase();
  return ["groceries", "housing", "utilities", "transport", "dining", "shopping", "education", "income", "investments", "other"].find((id) => normalized.includes(id)) ?? "other";
}

function sourceId(source?: string | null): TxFull["source"] {
  return source === "email" || source === "card" || source === "wallet" || source === "manual" ? source : "manual";
}

function mapTransaction(item: ApiTransaction): TxFull {
  const amount = Number(item.amount) * (item.type === "EXPENSE" ? -1 : 1);
  return {
    id: item.id,
    name: item.merchant || item.description,
    account: item.account?.name ?? "Unassigned",
    date: item.occurredAt.slice(0, 10),
    amount,
    category: categoryId(item.category?.name),
    taxable: item.isTaxable,
    source: sourceId(item.source),
    parse: { state: item.needsReview ? "review" : "parsed" },
    note: "",
  };
}

function mapReview(item: ApiReview): TxFull {
  const proposed = item.proposedData;
  const raw = item.rawData ?? {};
  const amount = Number(proposed?.amount ?? raw.amount ?? raw.total ?? 0);
  return {
    id: item.id,
    name: proposed?.description || raw.description || raw.merchant || "Imported transaction",
    account: "Imported",
    date: (proposed?.occurredAt || raw.date || new Date().toISOString()).slice(0, 10),
    amount: proposed?.type === "INCOME" ? Math.abs(amount) : -Math.abs(amount),
    category: "other",
    taxable: false,
    source: "manual",
    parse: { state: "review", confidence: 90 },
    note: `CSV row ${item.rowNumber}`,
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
  const isMobile = useIsMobile();
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void Promise.all([
      api.get<{ data: ApiTransaction[]; meta: { total: number } }>("/v1/transactions?page=1&pageSize=100"),
      api.get<{ data: ApiReview[] }>("/v1/reviews?status=PENDING"),
    ]).then(([transactionResponse, reviewResponse]) => {
      if (cancelled) return;
      setRows(transactionResponse.data.map(mapTransaction));
      setReviewRows(reviewResponse.data.map(mapReview));
      setSelectedId(transactionResponse.data[0] ? transactionResponse.data[0].id : null);
    }).catch(() => {
      setRows([]);
      setReviewRows([]);
    });
    return () => {
      cancelled = true;
    };
    // The API client is stable for the current Clerk session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (params.get("modal") === "import") {
      setImportOpen(true);
      router.replace("/transactions");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        amount: Math.abs(next.amount),
        description: next.name,
        occurredAt: next.date,
        source: next.source,
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

  const approveReview = async (ids: string[]) => {
    try {
      await Promise.all(ids.map((id) => api.post(`/v1/reviews/${id}/approve`, {})));
      setReviewRows((prev) => prev.filter((transaction) => !ids.includes(transaction.id)));
      const response = await api.get<{ data: ApiTransaction[] }>("/v1/transactions?page=1&pageSize=100");
      setRows(response.data.map(mapTransaction));
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
      await api.post("/v1/transactions/bulk-delete", { ids });
    } catch {
      // Keep the optimistic local behavior for fixture mode.
    }
    setRows((prev) => prev.filter((t) => !ids.includes(t.id)));
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
      const upload = await fetch(presigned.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!upload.ok) throw new Error("R2 upload failed");
      await api.post(`/v1/imports/${presigned.data.import.id}/process`, {});
      const reviews = await api.get<{ data: ApiReview[] }>("/v1/reviews?status=PENDING");
      setReviewRows(reviews.data.map(mapReview));
      setView("review");
    } catch {
      // Keep the ledger empty when the import API is unavailable; do not present unpersisted rows as real data.
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
        {view === "review" ? <ReviewQueue rows={reviewRows} onApprove={approveReview} onEdit={setEditId} /> : <>
          <TxTable
            rows={rows}
            selectedId={selectedId}
            onSelect={openDetail}
            onEdit={setEditId}
            onDelete={remove}
            onImport={() => setImportOpen(true)}
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
