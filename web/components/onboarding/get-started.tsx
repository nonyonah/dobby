"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CancelIcon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogFooter, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Progress, ProgressTrack } from "@/components/ui/progress";
import { QuickCreateModals } from "@/components/quick-create-modals";
import { WalletConnectModal } from "@/components/settings/wallet-connect-modal";
import { useApi } from "@/hooks/use-api";
import { guidanceFor, guidanceText } from "@/lib/error-guidance";
import { toast } from "@/components/ui/toast";
import { cn } from "cn";

/**
 * Get started: a pill on the home screen that opens the setup list in place.
 *
 * UI only. The three tasks, how each one is done, and how completion is decided
 * all come from the existing onboarding flow and its existing endpoints — this
 * component renders that same work where it can be finished without leaving the
 * dashboard. Nothing here decides anything the onboarding flow does not already
 * decide, and the full-screen flow at /onboarding is untouched.
 */

type Statuses = { statement: boolean; email: boolean; wallet: boolean };

type Task = {
  id: keyof Statuses;
  title: string;
  done: boolean;
};

const UNSET: Statuses = { statement: false, email: false, wallet: false };

/** Fraction as an integer 0–100, which is what the ring and track both take. */
function percentOf(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((done / total) * 100);
}

/**
 * Small circular progress ring.
 *
 * Drawn with stroke-dashoffset rather than a library so the ring inherits the
 * currentColor and follows the theme in both modes with no second asset. The
 * transition names the single property that moves.
 */
function ProgressRing({ percent, className }: { percent: number; className?: string }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 shrink-0", className)} aria-hidden="true">
      <circle cx="12" cy="12" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        // Rotated so the arc starts at twelve o'clock.
        transform="rotate(-90 12 12)"
        className="transition-[stroke-dashoffset] duration-500 ease-out"
      />
    </svg>
  );
}

function TaskList({ tasks, onAction, busyId }: { tasks: Task[]; onAction: (task: Task) => void; busyId: string | null }) {
  // Done tasks sink to the bottom, so what is left to do is what the eye lands
  // on first. Stable sort rather than reordering on toggle, so a row does not
  // jump out from under the pointer while it is being worked on.
  const ordered = [...tasks].sort((left, right) => Number(left.done) - Number(right.done));

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {ordered.map((task) => (
        <li key={task.id}>
          <div
            className={cn(
              "flex items-start gap-3 rounded-[10px] border border-line px-3.5 py-3",
              "transition-[opacity,background-color] duration-150",
              task.done ? "bg-muted/60 opacity-60" : "bg-card",
            )}
          >
            <span className="pt-0.5">
              {task.done ? (
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  size={18}
                  className="size-[18px] text-success"
                  aria-hidden="true"
                />
              ) : (
                <Checkbox checked={false} readOnly aria-hidden="true" className="pointer-events-none" tabIndex={-1} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-foreground">{task.title}</span>
            </span>
            <span className="shrink-0 self-center">
              {task.done ? (
                <span className="text-[12px] font-medium text-muted-foreground">Done</span>
              ) : (
                <Button variant="secondary" size="small" disabled={busyId !== null} onClick={() => onAction(task)}>
                  {busyId === task.id ? "Working…" : task.id === "email" ? "Connect" : task.id === "wallet" ? "Add" : "Import"}
                </Button>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The pill and its modal. Rendered once by the home screen. */
export function GetStarted() {
  const api = useApi();
  const [statuses, setStatuses] = useState<Statuses | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  const refreshStatuses = async () => {
    try {
      const [imports, integrations, wallets] = await Promise.all([
        api.get<{ data: unknown[] }>("/v1/imports"),
        api.get<{ data: Array<{ status: string }> }>("/v1/integrations"),
        api.get<{ data: unknown[] }>("/v1/wallets"),
      ]);
      setStatuses({
        statement: imports.data.length > 0,
        email: integrations.data.some((item) => item.status === "connected"),
        wallet: wallets.data.length > 0,
      });
    } catch {
      setStatuses(UNSET);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enters on mount. Without this the class is the animation's start state and
  // the pill would never appear.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const resolved = statuses ?? UNSET;
  const tasks: Task[] = [
    {
      id: "statement",
      title: "Upload a statement",
      done: resolved.statement,
    },
    {
      id: "email",
      title: "Connect your email",
      done: resolved.email,
    },
    {
      id: "wallet",
      title: "Add a stablecoin address",
      done: resolved.wallet,
    },
  ];

  const doneCount = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  const percent = percentOf(doneCount, total);
  const finished = doneCount === total;

  // "You're all set" is a beat, not a wall: the pill says so, then goes.
  useEffect(() => {
    if (!finished || !statuses) return;
    const timer = window.setTimeout(() => setAllDone(true), 4000);
    return () => window.clearTimeout(timer);
  }, [finished, statuses]);

  const visible = statuses !== null && !dismissed && !allDone;

  const onAction = async (task: Task) => {
    if (task.id === "statement") {
      setImportOpen(true);
      return;
    }
    if (task.id === "wallet") {
      setWalletOpen(true);
      return;
    }
    setBusyId(task.id);
    const popup = window.open("about:blank", "dobby-connect", "width=520,height=680");
    try {
      const response = await api.post<{ data: { redirectUrl: string } }>("/v1/integrations/gmail/connect", {});
      if (popup && !popup.closed) {
        popup.location.href = response.data.redirectUrl;
      } else {
        window.location.href = response.data.redirectUrl;
        return;
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        if (popup && popup.closed) break;
        try {
          const status = await api.post<{ data: { status: string } }>("/v1/integrations/gmail/refresh", {});
          if (status.data.status === "connected") break;
        } catch {
          // Keep polling while the popup is open.
        }
      }
      if (popup && !popup.closed) popup.close();
      await refreshStatuses();
    } catch (error) {
      const guidance = guidanceFor(error, "email");
      toast.error(guidance.title, { description: guidanceText(guidance) });
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async () => {
    setOpen(false);
    setDismissed(true);
    // The same dismissal the onboarding flow performs, so the two agree on what
    // "dismissed" means rather than inventing a second kind of hidden.
    try {
      await api.patch("/v1/me", { onboarded: true });
    } catch {
      // Best-effort: the pill is already gone for this session either way.
    }
  };

  const body = (
    <>
      <div className="flex flex-col gap-2 px-1 pb-1">
        <Progress value={percent}>
          <ProgressTrack className="h-1.5" />
        </Progress>
        <p className="m-0 text-[12px] font-medium tabular-nums text-muted-foreground">
          {finished ? `All ${total} done` : `${doneCount} of ${total} done`}
        </p>
      </div>
      <TaskList tasks={tasks} onAction={(task) => void onAction(task)} busyId={busyId} />
    </>
  );

  return (
    <>
      {visible ? (
        <div
          className={cn(
            // Compact for the top bar: the page title truncates, so the pill
            // holds its width and drops its label first on narrow screens.
            "flex shrink-0 items-center transition-[opacity,transform] duration-300 ease-out",
            mounted ? "translate-y-0 opacity-100" : "-translate-y-0.5 opacity-0",
          )}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className={cn(
              "inline-flex items-center gap-2 rounded-[50px] border border-line bg-card px-3.5 py-2",
              "text-[13px] font-medium text-foreground",
              "outline-none transition-colors duration-150 hover:bg-secondary",
              "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
              "h-7 px-2.5 sm:px-3.5",
            )}
          >
            <ProgressRing percent={percent} className="text-primary" />
            <span className="hidden sm:inline">{allDone ? "You're all set" : "Get started"}</span>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {doneCount}/{total}
            </span>
          </button>
        </div>
      ) : null}

      {/* A floating panel pinned to the bottom-right rather than a centred
          dialog. It is a short checklist, not a decision the user has to make
          before carrying on, so it should sit beside the work instead of
          covering it. The viewport is re-placed to get there; the backdrop is
          cleared because dimming the whole page for this size reads as a
          blocking modal, which it is not. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup
          showCloseButton={false}
          backdropClassName="bg-transparent"
          viewportClassName="grid-rows-1 justify-items-end items-end p-0"
          className={cn(
            // Anchored, not centred: override the popup's row placement and
            // origin so the panel opens from the corner it lives in.
            "row-start-1 m-3 w-[min(26rem,calc(100vw-1.5rem))] max-w-none origin-bottom-right",
            "max-h-[min(32rem,calc(100dvh-1.5rem))] rounded-[10px] p-0",
            // The base class ties the inner highlight ring to --radius-2xl;
            // leaving it would draw a 2xl ring inside a 10px panel.
            "before:rounded-[9px]",
          )}
        >
          <div className="flex items-start justify-between gap-3 px-4 pt-4">
            <DialogTitle className="text-[14px]">Get started</DialogTitle>
            <DialogClose
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1 -mt-1 shrink-0">
                  <HugeiconsIcon icon={CancelIcon} size={14} aria-hidden="true" />
                </Button>
              }
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">{body}</div>
          <DialogFooter className="px-4 pb-4 pt-0">
            <DialogClose
              render={
                <Button variant="ghost" size="small" className="px-0 text-muted-foreground hover:text-foreground" onClick={() => void dismiss()}>
                  Dismiss
                </Button>
              }
            />
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <QuickCreateModals
        kind={importOpen ? "import" : null}
        onClose={() => {
          setImportOpen(false);
          void refreshStatuses();
        }}
      />
      <WalletConnectModal
        open={walletOpen}
        onOpenChange={setWalletOpen}
        onConnected={() => {
          void refreshStatuses();
        }}
      />
    </>
  );
}