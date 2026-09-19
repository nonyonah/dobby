"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TxTable } from "@/components/tx-table";
import { TxDetail } from "@/components/tx-detail";
import { TxEditDialog } from "@/components/tx-edit-dialog";
import { TxImportDialog } from "@/components/tx-import-dialog";
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
  const editing = rows.find((t) => t.id === editId) ?? null;

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const save = (next: TxFull) => {
    setRows((prev) => prev.map((t) => (t.id === next.id ? next : t)));
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
        <TxTable
          rows={rows}
          selectedId={selectedId}
          onSelect={openDetail}
          onEdit={setEditId}
          onDelete={remove}
          onImport={() => setImportOpen(true)}
        />
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
          <div className="flex-1 overflow-y-auto px-6 pt-2 pb-6">
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
