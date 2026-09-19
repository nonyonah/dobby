"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TxTable } from "@/components/tx-table";
import { TxDetail } from "@/components/tx-detail";
import { TxEditDialog } from "@/components/tx-edit-dialog";
import { TxImportDialog } from "@/components/tx-import-dialog";
import { ReviewQueue } from "@/components/review-queue";

import { REVIEW_QUEUE } from "@/lib/review-queue";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { TRANSACTIONS_FULL, type TxFull } from "@/lib/transactions";

function TransactionsInner() {
  const [rows, setRows] = useState<TxFull[]>(TRANSACTIONS_FULL);
  const [reviewRows, setReviewRows] = useState<TxFull[]>(REVIEW_QUEUE);
  const [view, setView] = useState<"ledger" | "review">("review");
  const [selectedId, setSelectedId] = useState<string | null>(TRANSACTIONS_FULL[0].id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const isMobile = useIsMobile();
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

  const save = (next: TxFull) => {
    setRows((prev) => prev.map((t) => (t.id === next.id ? next : t)));
    setReviewRows((prev) => prev.map((t) => (t.id === next.id ? next : t)));
  };

  const approveReview = (ids: string[]) => {
    const approved = reviewRows
      .filter((transaction) => ids.includes(transaction.id))
      .map((transaction) => ({ ...transaction, parse: { state: "parsed" as const, confidence: transaction.parse.confidence ?? 100 } }));
    setRows((prev) => [...approved, ...prev]);
    setReviewRows((prev) => prev.filter((transaction) => !ids.includes(transaction.id)));
    setView("ledger");
  };

  const remove = (ids: string[]) => {
    setRows((prev) => prev.filter((t) => !ids.includes(t.id)));
    setSelectedId((current) => (current && ids.includes(current) ? null : current));
    setDrawerOpen(false);
  };

  const addRows = (incoming: TxFull[]) => {
    setRows((prev) => [...incoming, ...prev]);
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
