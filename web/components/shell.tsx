"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./topbar";
import { SidebarProvider } from "./ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { QuestionIcon } from "./icons";

const SIDEBAR_KEY = "rift-sidebar-collapsed";

interface ShellProps {
  title: string;
  active: "dashboard" | "transactions" | "insights" | "budget" | "goals" | "settings";
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
      className="min-h-screen bg-background"
    >
      <AppSidebar active={active} peek={peek} onPeekChange={setPeek} />

      <div className={`min-w-0 flex-1 ${collapsed ? "p-2" : "py-2 pr-2 pl-0 md:pl-1"}`}>
        <main className="min-h-[calc(100vh-16px)] rounded-xl border border-line bg-background shadow-none">
          <TopBar title={title} />
          {children}
        </main>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Contact support"
              title="Contact support"
              className="fixed right-4 bottom-4 z-40 flex size-10 cursor-pointer items-center justify-center rounded-full border border-line dark:border-border bg-card text-sidebar-foreground shadow-[0_8px_24px_rgb(23_24_28/0.16)] transition-colors outline-none hover:bg-secondary dark:hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <QuestionIcon />
            </button>
          }
        />
        <DropdownMenuContent align="end" side="top" className="w-64">
          <DropdownMenuLabel>Contact support</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <p className="m-0 text-[13px] font-medium text-[#1c1d20] dark:text-[#eceef0]">support@riftlabs.io</p>
            <p className="m-0 mt-0.5 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">Typically replies within a day</p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarProvider>
  );
}
