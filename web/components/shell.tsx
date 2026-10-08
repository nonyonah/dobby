"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./topbar";
import { SidebarProvider } from "./ui/sidebar";
import { QuestionIcon } from "./icons";
import { readStoredCurrency, writeStoredCurrency } from "@/lib/format";
import { usePlan } from "./plan-provider";
import { QuickCreateModals } from "./quick-create-modals";
import { TrialExpiredBanner } from "./upgrade";
import { openUserback, useUserbackWidget } from "./userback";

const SIDEBAR_KEY = "rift-sidebar-collapsed";

interface ShellProps {
  title: string;
  active: "dashboard" | "transactions" | "insights" | "budget" | "goals" | "settings" | "notifications" | "wallets";
  children: ReactNode;
}

/**
 * Shared app shell: shadcn Sidebar foundation (transparent rail flush to
 * the screen edge, offcanvas collapse, hover peek), sticky top bar, and
 * the elevated surface. Page scroll lives at the window.
 */
export function Shell({ title, active, children }: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [peek, setPeek] = useState(false);
  const [quickCreate, setQuickCreate] = useState<"import" | "budget" | "goal" | null>(null);
  const { ready: userbackReady } = useUserbackWidget();
  const { me } = usePlan();

  const handleSupportClick = () => {
    if (!openUserback()) window.open("mailto:support@riftlabs.xyz?subject=Dobby%20support", "_self");
  };

  /**
   * Seeds the display currency from the saved profile the first time a device
   * runs the app, so a fresh browser matches the account instead of showing
   * naira to a US user.
   *
   * Seed only — never a sync. This used to fetch `/v1/me` itself and write the
   * result unconditionally, on every mount, which meant a stale profile
   * silently overwrote the currency the user had just saved: the change appeared
   * to stick across the app, then reverted on the next navigation or reload.
   * The profile now comes from PlanProvider, which Settings refreshes after a
   * save, and a currency already stored here always wins.
   */
  useEffect(() => {
    if (readStoredCurrency()) return;
    const profile = me?.profile;
    const seeded = profile?.currency?.toUpperCase() ?? (profile?.country?.toUpperCase() === "US" ? "USD" : null);
    if (seeded) writeStoredCurrency(seeded);
  }, [me]);

  useEffect(() => {
    try {
      // Read persisted UI preference after hydration to avoid server/client markup drift.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(SIDEBAR_KEY) === "1") setCollapsed(true);
    } catch {
      // storage unavailable — sidebar stays open
    }
  }, []);

  const setCollapsedPersist = (value: boolean) => {
    setCollapsed(value);
    setPeek(false);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, value ? "1" : "0");
    } catch {
      // ignore write failures
    }
  };

  // Peek is a hover overlay only: it never drives the shadcn open state,
  // so the layout never shifts while previewing the collapsed sidebar.
  const handleOpenChange = (open: boolean) => {
    if (open) setPeek(false);
    setCollapsedPersist(!open);
  };

  return (
    <SidebarProvider
      open={!collapsed}
      onOpenChange={handleOpenChange}
      style={{ "--sidebar-width": "248px" } as CSSProperties}
      className="h-dvh overflow-hidden bg-background"
    >
      <AppSidebar active={active} peek={peek} onPeekChange={setPeek} onCreate={setQuickCreate} />

      {/* The shell is a fixed viewport: the rail, the column and the frame all
          hold their height, and only the pane under the top bar scrolls. The
          window itself never gains a scrollbar, so the sticky top bar, the
          floating support button and the selection toolbar all keep their
          relationship to the viewport instead of drifting with the page. */}
      <div className={`min-h-0 min-w-0 flex-1 overflow-hidden ${collapsed ? "p-2" : "py-2 pr-2 pl-0 md:pl-1"}`}>
        <main className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-background shadow-none">
          <TopBar title={title} />
          <TrialExpiredBanner />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
        </main>
      </div>

      <QuickCreateModals kind={quickCreate} onClose={() => setQuickCreate(null)} />

      {/* Floating support launcher. Opens the Userback feedback widget, which
          paints its own launcher button in the same corner once it initialises.
          Until then (or if the token is missing / the script fails) we render
          this button, which falls back to the contact email. */}
      {!userbackReady ? (
        <button
          type="button"
          aria-label="Send feedback"
          title="Send feedback"
          onClick={handleSupportClick}
          className="fixed right-4 bottom-4 z-40 flex size-10 cursor-pointer items-center justify-center rounded-md border border-line dark:border-border bg-card text-sidebar-foreground shadow-[0_8px_24px_rgb(23_24_28/0.16)] transition-colors outline-none hover:bg-secondary dark:hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <QuestionIcon />
        </button>
      ) : null}
    </SidebarProvider>
  );
}
