"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Alert, AlertContent, AlertDescription, AlertTitle } from "./ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "./ui/drawer";
import { Meter } from "./module-card";
import { formatUSD } from "@/lib/format";
import type { Goal, GoalFundingSource, GoalStatus } from "@/lib/goals";
import { CheckIcon, MoreIcon, PlusIcon, SettingsIcon } from "./icons";
import { EmojiPickerField } from "./ui/emoji-picker";
import { useApi } from "@/hooks/use-api";
const sourceOptions: { value: GoalFundingSource; label: string; source: string }[] = [
  { value: "wallet", label: "Main wallet + Business account", source: "Main wallet + Business account" },
  { value: "account", label: "Business account", source: "Business account" },
  { value: "income-rule", label: "10% of every incoming payment (planned)", source: "10% of every incoming payment" },
];
type CreateStep = "suggestion" | "plan" | "manual";
type ChartView = "month" | "all";

function projection(goal: Goal) {
  if (goal.monthlyRate <= 0 || goal.tracked >= goal.target || goal.status !== "active") return null;
  return Math.ceil((goal.target - goal.tracked) / goal.monthlyRate);
}

function statusLabel(status: GoalStatus) {
  return status === "ready" ? "Ready to spend" : status[0].toUpperCase() + status.slice(1);
}

function StatusPill({ status }: { status: GoalStatus }) {
  const tone = status === "active" ? "bg-accent-100 text-accent-600" : status === "ready" ? "bg-[#00afb9] text-white" : "bg-secondary text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{statusLabel(status)}</span>;
}

export function GoalsSection() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [chartView, setChartView] = useState<ChartView>("month");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState<CreateStep>("suggestion");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [target, setTarget] = useState("");
  const [monthly, setMonthly] = useState("");
  const [source, setSource] = useState<GoalFundingSource>("wallet");
  const [targetDate, setTargetDate] = useState("");
  const [timing, setTiming] = useState<"monthly" | "date">("monthly");
  const [error, setError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    void api.get<{ data: Array<{ id: string; name: string; targetAmount: number | string; deadline?: string | null; status: "ACTIVE" | "ARCHIVED"; currentAmount?: number | string; contributions: Array<{ id: string; contributedAt: string; amount: number | string; note?: string | null }> }> }>("/v1/goals").then((response) => {
      setGoals(response.data.map((goal) => ({
        id: goal.id,
        name: goal.name,
        emoji: "🎯",
        target: Number(goal.targetAmount),
        tracked: Number(goal.currentAmount ?? 0),
        source: "Personal account",
        fundingSource: "account",
        targetDate: goal.deadline?.slice(0, 10),
        monthlyRate: 0,
        status: Number(goal.currentAmount ?? 0) >= Number(goal.targetAmount) ? "ready" : goal.status === "ARCHIVED" ? "archived" : "active",
        reactivateOnSpend: true,
        contributions: goal.contributions.map((contribution) => ({ id: contribution.id, date: contribution.contributedAt.slice(0, 10), name: contribution.note ?? "Goal contribution", amount: Number(contribution.amount) })),
      })));
    }).catch(() => setGoals([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const createGoal = params.get("create");
  useEffect(() => {
    if (createGoal === "1") {
      openCreate();
      router.replace("/budget/goals");
    }
  }, [createGoal, router]);

  const selected = goals.find((goal) => goal.id === selectedId) ?? null;
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const readyGoals = goals.filter((goal) => goal.status === "ready");
  const archivedGoals = goals.filter((goal) => goal.status === "archived");
  const savedThisMonth = activeGoals.reduce((sum, goal) => sum + goal.contributions.filter((contribution) => contribution.date.startsWith("2026-09")).reduce((inner, contribution) => inner + contribution.amount, 0), 0);
  const neededThisMonth = activeGoals.reduce((sum, goal) => sum + goal.monthlyRate, 0);
  const savedAllTime = goals.filter((goal) => goal.status !== "archived").reduce((sum, goal) => sum + goal.tracked, 0);
  const remainingAllTime = activeGoals.reduce((sum, goal) => sum + Math.max(0, goal.target - goal.tracked), 0);
  const chartLeft = chartView === "month" ? savedThisMonth : savedAllTime;
  const chartRight = chartView === "month" ? neededThisMonth : remainingAllTime;
  const chartLabel = chartView === "month" ? "saved this month" : "saved across active goals";
  const comparisonLabel = chartView === "month" ? "needed to stay on track this month" : "left to complete active goals";
  const progress = chartLeft + chartRight > 0 ? Math.min(100, (chartLeft / (chartLeft + chartRight)) * 100) : 0;

  const openCreate = () => {
    setEditingId(null);
    setStep("manual");
    setName("");
    setEmoji("✨");
    setTarget("");
    setMonthly("");
    setSource("wallet");
    setTargetDate("");
    setTiming("monthly");
    setError("");
    setCreateOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setSelectedId(null);
    setEditingId(goal.id);
    setStep("manual");
    setName(goal.name);
    setEmoji(goal.emoji);
    setTarget(String(goal.target));
    setMonthly(String(goal.monthlyRate));
    setSource(goal.fundingSource);
    setTargetDate(goal.targetDate ?? "");
    setTiming(goal.targetDate ? "date" : "monthly");
    setError("");
    setCreateOpen(true);
  };

  const saveGoal = async () => {
    const targetAmount = Number(target);
    const monthlyAmount = Number(monthly || 0);
    if (!name.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(monthlyAmount) || monthlyAmount < 0) {
      setError("Add a name, target amount, and a valid monthly saving amount.");
      return;
    }
    const sourceDetails = sourceOptions.find((option) => option.value === source)!;
    try {
      if (editingId) {
        const response = await api.patch<{ data: { id: string; name: string; targetAmount: number | string; deadline?: string | null; status: "ACTIVE" | "ARCHIVED"; currentAmount?: number | string; contributions: Array<{ id: string; contributedAt: string; amount: number | string; note?: string | null }> } }>(`/v1/goals/${editingId}`, { name: name.trim(), targetAmount, deadline: timing === "date" ? targetDate || null : null });
        const updated = response.data;
        setGoals((current) => current.map((goal) => goal.id === editingId ? { ...goal, name: updated.name, target: Number(updated.targetAmount), targetDate: updated.deadline?.slice(0, 10), monthlyRate: monthlyAmount, source: sourceDetails.source, fundingSource: source } : goal));
      } else {
        const response = await api.post<{ data: { id: string; name: string; targetAmount: number | string; deadline?: string | null; currentAmount?: number | string; contributions: [] } }>("/v1/goals", { name: name.trim(), targetAmount, currency: "USD", deadline: timing === "date" ? targetDate || null : null });
        const created = response.data;
        const id = created.id;
        setGoals((current) => [...current, { id, name: created.name, emoji, target: Number(created.targetAmount), tracked: 0, monthlyRate: monthlyAmount, source: sourceDetails.source, fundingSource: source, targetDate: created.deadline?.slice(0, 10), status: "active", reactivateOnSpend: true, contributions: [] }]);
        setSelectedId(id);
      }
    } catch {
      setError("Could not save this goal. Please try again.");
      return;
    }
    setCreateOpen(false);
  };

  const acceptSuggestion = () => {
    setName("Emergency Buffer");
    setEmoji("🛟");
    setTarget("10000");
    setMonthly("800");
    setSource("wallet");
    setTiming("monthly");
    setStep("plan");
  };

  const recordSpend = (goal: Goal) => {
    const amount = Math.min(250, goal.tracked);
    setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, tracked: item.tracked - amount, status: item.status === "ready" && item.reactivateOnSpend ? "active" : item.status } : item));
  };

  const recordContribution = async (goal: Goal) => {
    const amount = 250;
    try {
      const response = await api.post<{ data: { goal: { currentAmount?: number | string; contributions: Array<{ id: string; contributedAt: string; amount: number | string; note?: string | null }> } } }>(`/v1/goals/${goal.id}/contributions`, { amount, note: "Manual goal contribution" });
      const updated = response.data.goal;
      setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, tracked: Number(updated.currentAmount ?? item.tracked + amount), status: Number(updated.currentAmount ?? 0) >= item.target ? "ready" : item.status, contributions: updated.contributions.map((contribution) => ({ id: contribution.id, date: contribution.contributedAt.slice(0, 10), name: contribution.note ?? "Goal contribution", amount: Number(contribution.amount) })) } : item));
    } catch {
      setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, tracked: item.tracked + amount, contributions: [{ id: `contribution-${Date.now()}`, date: new Date().toISOString().slice(0, 10), name: "Manual goal contribution", amount }, ...item.contributions] } : item));
    }
  };

  const updateGoal = async (id: string, changes: Partial<Goal>) => {
    if (changes.status === "archived" || changes.status === "active") {
      try { await api.post(`/v1/goals/${id}/${changes.status === "archived" ? "archive" : "reactivate"}`, {}); } catch { /* local fallback */ }
    }
    setGoals((current) => current.map((goal) => goal.id === id ? { ...goal, ...changes } : goal));
  };
  const deleteGoal = async (id: string) => { try { await api.delete(`/v1/goals/${id}`); } catch { /* local fallback */ } setGoals((current) => current.filter((goal) => goal.id !== id)); setSelectedId(null); setDeleteConfirmId(null); };

  const listRow = (goal: Goal) => {
    const goalProgress = Math.min(100, (goal.tracked / goal.target) * 100);
    const months = projection(goal);
    return <button key={goal.id} type="button" onClick={() => setSelectedId(goal.id)} aria-current={selectedId === goal.id ? "true" : undefined} className={`grid w-full cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)_5rem_minmax(0,1fr)_6.5rem] items-center gap-3 rounded-[10px] px-3 py-2 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${selectedId === goal.id ? "bg-accent-100/70" : "hover:bg-secondary"}`}>
      <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg bg-secondary text-[15px]">{goal.emoji}</span>
      <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{goal.name}</span><span className="block truncate text-[11px] text-muted-foreground">{projection(goal) ? `${goal.source} · about ${projection(goal)} ${projection(goal) === 1 ? "month" : "months"} left` : goal.source}</span></span>
      <span className="mono text-right text-[12px] font-medium tabular-nums">{goalProgress.toFixed(0)}%</span>
      <span className="min-w-0"><Meter value={goalProgress} tone={goal.status === "ready" ? "green" : "accent"} /></span>
      <span className="text-right"><StatusPill status={goal.status} /><span className="mono mt-1 block text-[11px] text-muted-foreground tabular-nums">{formatUSD(goal.tracked)}</span></span>
      {months ? <span className="sr-only">Estimated {months} months remaining</span> : null}
    </button>;
  };

  return <>
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] text-muted-foreground">September 2026</span>
      <Button variant="primary" onClick={openCreate}><PlusIcon /> Add goal</Button>
    </div>

    <div className="mt-4 rounded-2xl border-0 bg-card px-6 py-5">
      <div className="grid grid-cols-[1fr_140px_1fr] items-center gap-4">
        <div className="text-center"><p className="mono m-0 text-[20px] font-semibold tabular-nums">{formatUSD(chartLeft)}</p><p className="m-0 text-[12px] text-muted-foreground">{chartLabel}</p></div>
        <div className="relative flex aspect-square h-30 w-30 items-center justify-center">
          <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="14" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 52}
              strokeDashoffset={2 * Math.PI * 52 * (1 - Math.min(1, Math.max(0, progress / 100)))}
            />
          </svg>
          <div className="flex size-23 flex-col items-center justify-center rounded-full bg-card text-center"><span className="mono text-[16px] font-semibold">{progress.toFixed(0)}%</span><span className="text-[10px] text-muted-foreground">on pace</span></div>
          <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Goal chart settings" title="Goal chart settings" className="absolute right-0 bottom-0 flex size-8 cursor-pointer items-center justify-center rounded-full border border-line bg-card text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><SettingsIcon /></button>
        </div>
        <div className="text-center"><p className="mono m-0 text-[20px] font-semibold tabular-nums">{formatUSD(chartRight)}</p><p className="m-0 text-[12px] text-muted-foreground">{comparisonLabel}</p></div>
      </div>
    </div>

    <div className="mt-4 rounded-2xl border-0 bg-card px-3 py-3">
      <div className="grid h-9 grid-cols-[1.5rem_minmax(0,1fr)_5rem_minmax(0,1fr)_6.5rem] items-center gap-3 px-3 text-[12px] font-semibold text-foreground"><span /><span>Goals</span><span className="text-right">PROGRESS</span><span /><span className="text-right">STATUS</span></div>
      {activeGoals.length > 0 ? <><p className="m-0 px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Active</p>{activeGoals.map(listRow)}</> : null}
      {readyGoals.length > 0 ? <><p className="m-0 px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ready to spend</p>{readyGoals.map(listRow)}</> : null}
      {archivedGoals.length > 0 ? <><p className="m-0 px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Archived</p>{archivedGoals.map(listRow)}</> : null}
    </div>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Goals chart settings</DialogTitle><DialogDescription>Choose the time frame used in the savings comparison.</DialogDescription></DialogHeader>
        <div className="grid gap-2"><button type="button" onClick={() => { setChartView("month"); setSettingsOpen(false); }} aria-pressed={chartView === "month"} className={`rounded-lg border p-3 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${chartView === "month" ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}><span className="block text-[13px] font-medium">This month</span><span className="mt-1 block text-[12px] text-muted-foreground">Compare this month’s contributions with the amount needed to stay on track.</span></button><button type="button" onClick={() => { setChartView("all"); setSettingsOpen(false); }} aria-pressed={chartView === "all"} className={`rounded-lg border p-3 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${chartView === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}><span className="block text-[13px] font-medium">All time</span><span className="mt-1 block text-[12px] text-muted-foreground">Compare total active-goal savings with the amount remaining to finish them.</span></button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent className="sm:max-w-md">
        {step === "suggestion" && !editingId ? <>
          <DialogHeader><DialogTitle>Start with a smart goal</DialogTitle><DialogDescription>Based on mock cash flow, there is room to build a stronger cash buffer without interrupting this month’s commitments.</DialogDescription></DialogHeader>
          <div className="rounded-lg border border-border bg-secondary/40 p-3"><div className="flex items-center justify-between"><span className="text-[12px] text-muted-foreground">Available after spending</span><span className="mono text-[13px] font-semibold">{formatUSD(3100)} / month</span></div></div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3"><p className="m-0 flex items-center gap-2 text-[13px] font-medium"><span className="flex size-7 items-center justify-center rounded-lg bg-primary/15" aria-hidden="true">🛟</span>Build an Emergency Buffer</p><p className="m-0 mt-1 text-[12px] leading-relaxed text-muted-foreground">Set aside {formatUSD(800)} each month toward a {formatUSD(10000)} buffer. At the current rate, you can reach it in about 13 months.</p></div>
          <DialogFooter className="sm:justify-between"><Button variant="ghost" onClick={() => setStep("manual")}>Create manually</Button><Button variant="primary" onClick={acceptSuggestion}>Review suggestion</Button></DialogFooter>
        </> : step === "plan" && !editingId ? <>
          <DialogHeader><DialogTitle>Review your saving plan</DialogTitle><DialogDescription>Confirm the suggested monthly contribution and the balance that will feed it.</DialogDescription></DialogHeader>
          <div className="rounded-lg border border-border p-3"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[13px] font-medium"><span className="flex size-7 items-center justify-center rounded-lg bg-secondary" aria-hidden="true">🛟</span>Emergency Buffer</span><span className="mono text-[13px] font-semibold">{formatUSD(800)} / month</span></div><p className="m-0 mt-2 text-[12px] text-muted-foreground">Main wallet balance will be passively tracked toward a {formatUSD(10000)} target.</p></div>
          <DialogFooter className="sm:justify-between"><Button variant="ghost" onClick={() => setStep("manual")}>Adjust manually</Button><Button variant="primary" onClick={saveGoal}>Create goal</Button></DialogFooter>
        </> : <>
          <DialogHeader><DialogTitle>{editingId ? "Edit goal" : "Create a goal manually"}</DialogTitle><DialogDescription>Use a dedicated balance for passive tracking, then choose a monthly cadence or target date.</DialogDescription></DialogHeader>
          <div className="space-y-3"><div className="space-y-1.5"><label htmlFor="goal-name" className="text-[12px] font-medium text-muted-foreground">Goal name</label><div className="flex items-center gap-2"><EmojiPickerField value={emoji} onChange={setEmoji} label="Choose a goal emoji" /><Input id="goal-name" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="e.g. Tax Reserve" /></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor="goal-target" className="text-[12px] font-medium text-muted-foreground">Target amount</label><Input id="goal-target" value={target} onChange={(event) => { setTarget(event.target.value); setError(""); }} inputMode="decimal" className="mono" placeholder="10,000" /></div><div className="space-y-1.5"><label htmlFor="goal-monthly" className="text-[12px] font-medium text-muted-foreground">Monthly saving</label><Input id="goal-monthly" value={monthly} onChange={(event) => { setMonthly(event.target.value); setError(""); }} inputMode="decimal" className="mono" placeholder="800" /></div></div>
            <div className="space-y-1.5"><label htmlFor="goal-source" className="text-[12px] font-medium text-muted-foreground">Funding source</label><Select value={source} onValueChange={(value) => setSource((value ?? "wallet") as GoalFundingSource)}><SelectTrigger id="goal-source" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{sourceOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setTiming("monthly")} aria-pressed={timing === "monthly"} className={`rounded-lg border p-2.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${timing === "monthly" ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}><span className="block text-[12px] font-medium">Monthly savings</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Track a steady contribution.</span></button><button type="button" onClick={() => setTiming("date")} aria-pressed={timing === "date"} className={`rounded-lg border p-2.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring ${timing === "date" ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}><span className="block text-[12px] font-medium">Target date</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Save toward a deadline.</span></button></div>
            {timing === "date" ? <div className="space-y-1.5"><label htmlFor="goal-date" className="text-[12px] font-medium text-muted-foreground">Target date</label><Input id="goal-date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></div> : null}
            {error ? <p className="m-0 text-[12px] text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="sm:justify-between"><Button variant="ghost" onClick={() => editingId ? setCreateOpen(false) : setStep("suggestion")}>{editingId ? "Cancel" : "Back"}</Button><Button variant="primary" onClick={saveGoal}><CheckIcon /> {editingId ? "Save goal" : "Create goal"}</Button></DialogFooter>
        </>}
      </DialogContent>
    </Dialog>

    <Drawer open={selected !== null} onOpenChange={(open) => { if (!open) setSelectedId(null); }} showSwipeHandle={isMobile} swipeDirection={isMobile ? "down" : "right"}>
      <DrawerContent className="[--drawer-content-width:min(32.5rem,calc(100vw-4rem))] sm:[--drawer-content-width:32.5rem]">
        <DrawerHeader className="sr-only"><DrawerTitle>Goal details</DrawerTitle><DrawerDescription>Progress, contributions, spending, and lifecycle settings for the selected goal.</DrawerDescription></DrawerHeader>
        <div className="scrollbar-hide flex-1 overflow-y-auto px-6 pt-2 pb-6">
          {selected ? <div className="space-y-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="m-0 text-[16px] font-semibold">{selected.emoji} {selected.name}</h2><p className="m-0 mt-1 text-[12px] text-muted-foreground">Funded by {selected.source}{selected.targetDate ? ` · target ${new Date(`${selected.targetDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</p></div><div className="flex shrink-0 items-center gap-2"><StatusPill status={selected.status} /><DropdownMenu><DropdownMenuTrigger aria-label={`${selected.name} actions`} className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><MoreIcon /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => updateGoal(selected.id, { status: selected.status === "archived" ? "active" : "archived" })}>{selected.status === "archived" ? "Restore goal" : "Archive goal"}</DropdownMenuItem><DropdownMenuItem variant="destructive" onClick={() => setDeleteConfirmId(selected.id)}>Delete goal</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></div>
            {selected.status === "ready" ? <Alert status="success"><AlertContent><AlertTitle>Goal reached</AlertTitle><AlertDescription>This goal is ready to spend. Spending from it can reactivate it if the balance drops below target.</AlertDescription></AlertContent></Alert> : null}
                        <div className="rounded-2xl border-0 bg-card p-4"><div className="flex items-end justify-between"><div><p className="m-0 text-[12px] text-muted-foreground">Current progress</p><p className="mono m-0 mt-1 text-[20px] font-semibold">{formatUSD(selected.tracked)}</p></div><span className="mono text-[12px] text-muted-foreground">{Math.min(100, (selected.tracked / selected.target) * 100).toFixed(0)}%</span></div><div className="mt-4"><Meter value={(selected.tracked / selected.target) * 100} tone={selected.status === "ready" ? "green" : "accent"} /></div><p className="mono m-0 mt-2 text-[12px] text-muted-foreground">{formatUSD(selected.tracked)} of {formatUSD(selected.target)}</p>{projection(selected) ? <p className="m-0 mt-2 text-[12px] text-muted-foreground">At {formatUSD(selected.monthlyRate)} per month, you’ll reach this goal in about {projection(selected)} {projection(selected) === 1 ? "month" : "months"}.</p> : selected.status === "ready" ? <p className="m-0 mt-2 text-[12px] text-success">You reached this goal. It’s ready to spend.</p> : null}</div>
            {selected.status !== "archived" ? <div className="space-y-3"><div className="flex items-center justify-between gap-3"><div><p className="m-0 text-[13px] font-medium">Reactivate after spending</p><p className="m-0 mt-0.5 text-[12px] text-muted-foreground">Move back to Active if spending drops below the target.</p></div><Switch checked={selected.reactivateOnSpend} onCheckedChange={(checked) => updateGoal(selected.id, { reactivateOnSpend: checked })} /></div><div className="flex flex-col gap-2"><Button className="w-full" variant="secondary" onClick={() => recordContribution(selected)}><CheckIcon /> Record $250 contribution</Button><Button className="w-full" variant="secondary" onClick={() => recordSpend(selected)}>{selected.status === "ready" ? "Associate $250 spending" : "Record $250 spending"}</Button></div></div> : null}
            <div><p className="m-0 text-[13px] font-medium">Recent contributions</p>{selected.contributions.length ? <ul className="m-0 mt-2 list-none divide-y divide-soft-line p-0">{selected.contributions.map((contribution) => <li key={contribution.id} className="flex items-center justify-between gap-3 py-2"><span><span className="block text-[13px]">{contribution.name}</span><span className="block text-[11px] text-muted-foreground">{new Date(`${contribution.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></span><span className="mono text-[12px] font-medium text-success">+{formatUSD(contribution.amount)}</span></li>)}</ul> : <p className="m-0 mt-2 text-[12px] text-muted-foreground">No matched contributions yet.</p>}</div>
            <div className="flex items-center justify-end gap-2 border-t border-soft-line pt-4"><Button variant="secondary" size="small" onClick={() => openEdit(selected)}>Edit</Button></div>
          </div> : null}
        </div>
      </DrawerContent>
    </Drawer>

    <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete this goal?</AlertDialogTitle><AlertDialogDescription>This removes the goal and its tracked progress from this view. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (deleteConfirmId) deleteGoal(deleteConfirmId); }}>Delete goal</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
