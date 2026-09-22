"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { BudgetBoard } from "@/components/budget-board";
import { BudgetDrawer } from "@/components/budget-drawer";
import { BudgetDialog } from "@/components/budget-dialog";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { PlusIcon } from "@/components/icons";

import { INITIAL_BUDGETS, type BudgetDef } from "@/lib/budgets";
import { useApi } from "@/hooks/use-api";

export default function BudgetPage() {
  return (
    <Suspense fallback={null}>
      <BudgetInner />
    </Suspense>
  );
}

function BudgetInner() {
  const [budgets, setBudgets] = useState<Record<string, BudgetDef>>(INITIAL_BUDGETS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; catId: string }>(null);
  const [budgetIds, setBudgetIds] = useState<Record<string, string>>({});
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});
  const isMobile = useIsMobile();
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void Promise.all([
      api.get<{ data: Array<{ id: string; name: string; isArchived: boolean }> }>("/v1/categories"),
      api.get<{ data: Array<{ id: string; category: { id: string; name: string }; type: "FIXED" | "PERCENTAGE"; value: number | string; isExcluded: boolean }> }>("/v1/budgets"),
    ]).then(([categoryResponse, budgetResponse]) => {
      const ids = Object.fromEntries(categoryResponse.data.filter((category) => !category.isArchived).map((category) => [category.name.toLowerCase(), category.id]));
      setCategoryIds(ids);
      const next: Record<string, BudgetDef> = {};
      const nextBudgetIds: Record<string, string> = {};
      for (const budget of budgetResponse.data) {
        const key = budget.category.name.toLowerCase();
        next[key] = { type: budget.type === "PERCENTAGE" ? "percent" : "fixed", value: Number(budget.value), excluded: budget.isExcluded };
        nextBudgetIds[key] = budget.id;
      }
      if (Object.keys(next).length) setBudgets(next);
      setBudgetIds(nextBudgetIds);
    }).catch(() => {
      // Keep fixture budgets as a development fallback.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);
  const params = useSearchParams();
  const router = useRouter();


  useEffect(() => {
    if (params.get("create") === "1") {
      setDialog({ mode: "create" });
      router.replace("/budget");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  const save = async (catId: string, def: BudgetDef) => {
    const categoryId = categoryIds[catId] ?? categoryIds[catId.toLowerCase()];
    const payload = { categoryId, type: def.type === "percent" ? "PERCENTAGE" : "FIXED", value: def.value, isExcluded: false };
    try {
      if (budgetIds[catId]) {
        await api.patch(`/v1/budgets/${budgetIds[catId]}`, payload);
      } else if (categoryId) {
        const response = await api.post<{ data: { id: string } }>("/v1/budgets", payload);
        setBudgetIds((current) => ({ ...current, [catId]: response.data.id }));
      }
    } catch {
      // Keep local fixture behavior if the API is unavailable.
    }
    setBudgets((prev) => ({ ...prev, [catId]: { ...def, excluded: false } }));
  };

  const toggleExclude = async (catId: string) => {
    const current = budgets[catId] ?? { type: "fixed" as const, value: 0 };
    const excluded = !current.excluded;
    try { if (budgetIds[catId]) await api.patch(`/v1/budgets/${budgetIds[catId]}`, { isExcluded: excluded }); } catch { /* local fallback */ }
    setBudgets((prev) => ({ ...prev, [catId]: { ...current, excluded } }));
  };

  const remove = async (catId: string) => {
    try { if (budgetIds[catId]) await api.delete(`/v1/budgets/${budgetIds[catId]}`); } catch { /* local fallback */ }
    setBudgets((prev) => { const next = { ...prev }; delete next[catId]; return next; });
    setDrawerOpen(false);
    setSelectedId(null);
  };

  return (
    <>
      <div className="w-full px-6 pt-6 pb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-[12px] text-muted-foreground">September 2026</span>
          <Button variant="primary" onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon />
            Create budget
          </Button>
        </div>

        <BudgetBoard budgets={budgets} selectedId={selectedId} onSelect={openDetail} />
      </div>
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        showSwipeHandle={isMobile}
        swipeDirection={isMobile ? "down" : "right"}
      >
        <DrawerContent className="[--drawer-content-width:min(32.5rem,calc(100vw-4rem))] sm:[--drawer-content-width:32.5rem]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Category details</DrawerTitle>
            <DrawerDescription>
              Budget, tracked sources and transactions for the selected category.
            </DrawerDescription>
          </DrawerHeader>
          <div className="scrollbar-hide flex-1 overflow-y-auto px-6 pt-2 pb-6">
            {selectedId ? (
              <BudgetDrawer
                catId={selectedId}
                budgets={budgets}
                onEdit={(id) => setDialog({ mode: "edit", catId: id })}
                onToggleExclude={toggleExclude}
                onDelete={remove}
              />
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
      <BudgetDialog
        key={dialog?.mode === "edit" ? `edit-${dialog.catId}` : dialog?.mode ?? "closed"}
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        catId={dialog?.mode === "edit" ? dialog.catId : null}
        initial={
          dialog?.mode === "edit" && budgets[dialog.catId]
            ? budgets[dialog.catId]
            : { type: "fixed", value: 0 }
        }
        title={dialog?.mode === "edit" ? "Edit budget" : "Create budget"}
        onSave={save}
      />
    </>
  );
}
