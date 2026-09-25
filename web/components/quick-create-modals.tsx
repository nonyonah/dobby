"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { TxImportDialog } from "./tx-import-dialog";
import { BudgetDialog } from "./budget-dialog";
import type { BudgetDef } from "@/lib/budgets";
import { useApi } from "@/hooks/use-api";
import type { TxFull } from "@/lib/transactions";

type QuickCreateKind = "import" | "budget" | "goal" | null;

export function QuickCreateModals({ kind, onClose }: { kind: QuickCreateKind; onClose: () => void }) {
  const api = useApi();
  const { isSignedIn } = useAuth();
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>({});
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalMonthly, setGoalMonthly] = useState("");
  const [goalDate, setGoalDate] = useState("");

  useEffect(() => {
    if (kind !== "budget" || !isSignedIn) return;
    void api.get<{ data: Array<{ id: string; name: string; isArchived: boolean }> }>("/v1/categories")
      .then((response) => setCategoryIds(Object.fromEntries(response.data.filter((item) => !item.isArchived).map((item) => [item.name.toLowerCase(), item.id]))))
      .catch(() => setCategoryIds({}));
  }, [api, isSignedIn, kind]);

  useEffect(() => {
    if (kind === "goal") {
      setGoalName("");
      setGoalTarget("");
      setGoalMonthly("");
      setGoalDate("");
    }
  }, [kind]);

  const importRows = async (rows: TxFull[], file?: File, importType?: "CSV" | "OFX" | "QFX" | "RECEIPT") => {
    if (!isSignedIn) return;
    try {
      if (!file) {
        await Promise.all(rows.map((row) => api.post("/v1/transactions", { type: row.amount >= 0 ? "INCOME" : "EXPENSE", amount: Math.abs(row.amount), description: row.name, occurredAt: row.date, source: "manual", isTaxable: row.taxable })));
      } else {
        const ext = file.name.split(".").pop()?.toLowerCase();
        const contentType = file.type || (ext === "ofx" ? "application/ofx" : ext === "qfx" ? "application/qfx" : ext === "pdf" ? "application/pdf" : importType === "RECEIPT" ? "image/jpeg" : "text/csv");
        const response = await api.post<{ data: { import: { id: string }; uploadUrl: string } }>("/v1/imports/presign", { originalName: file.name, type: importType ?? "CSV", contentType });
        await api.put(`/v1/imports/${response.data.import.id}/file`, file, contentType);
        const processResponse = await api.post<{ data: { jobId?: string } }>(`/v1/imports/${response.data.import.id}/process`, {});
        if (processResponse.data.jobId) {
          for (let attempt = 0; attempt < 120; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const job = await api.get<{ data: { status: string; errorMessage?: string | null } }>(`/v1/imports/jobs/${processResponse.data.jobId}`);
            if (job.data.status === "REVIEW" || job.data.status === "COMPLETED") break;
            if (job.data.status === "FAILED") throw new Error(job.data.errorMessage || "Import processing failed.");
            if (attempt === 119) throw new Error("Import is still processing. Check the review queue shortly.");
          }
        }
      }
      onClose();
    } catch (error) { throw error instanceof Error ? error : new Error("Could not complete the import. Please try again."); }
  };

  const saveBudget = async (categoryKey: string, definition: BudgetDef) => {
    const categoryId = categoryIds[categoryKey.toLowerCase()];
    if (!categoryId) { toast.error("Categories are still loading. Please try again."); return; }
    try {
      await api.post("/v1/budgets", { categoryId, type: definition.type === "percent" ? "PERCENTAGE" : "FIXED", value: definition.value, isExcluded: false });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save the budget."); return; }
    onClose();
    toast.success("Budget created");
  };

  const saveGoal = async () => {
    const targetAmount = Number(goalTarget);
    const monthlyAmount = Number(goalMonthly || 0);
    if (!goalName.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
      toast.error("Add a name, target amount, and valid monthly saving amount.");
      return;
    }
    try {
      await api.post("/v1/goals", { name: goalName.trim(), targetAmount, currency: "USD", deadline: goalDate || null });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save the goal."); return; }
    onClose();
    toast.success("Goal created");
  };

  return <>
    <TxImportDialog open={kind === "import"} onOpenChange={(open) => !open && onClose()} onImport={importRows} />
    <BudgetDialog open={kind === "budget"} onOpenChange={(open) => !open && onClose()} catId={null} initial={{ type: "fixed", value: 0 }} title="Create budget" onSave={(categoryKey, definition) => { void saveBudget(categoryKey, definition); }} />
    <Dialog open={kind === "goal"} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create a goal</DialogTitle><DialogDescription>Use the same saving plan fields as the Goals page.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <Input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="e.g. Tax Reserve" aria-label="Goal name" />
          <div className="grid grid-cols-2 gap-3"><Input value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} inputMode="decimal" placeholder="Target amount" aria-label="Target amount" /><Input value={goalMonthly} onChange={(event) => setGoalMonthly(event.target.value)} inputMode="decimal" placeholder="Monthly saving" aria-label="Monthly saving" /></div>
          <Input type="date" value={goalDate} onChange={(event) => setGoalDate(event.target.value)} aria-label="Target date" />
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void saveGoal()}>Create goal</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
