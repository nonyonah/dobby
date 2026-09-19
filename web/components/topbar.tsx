"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "./ui/sidebar";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Button } from "./ui/button";
import {
  BellIcon,
  DashboardIconFull,
  InsightsIcon,
  SearchIcon,
  TransactionsIcon,
  UploadIcon,
} from "./icons";

const NOTIFICATIONS = [
  { id: "n1", title: "Invoice #0192 was paid", time: "2m" },
  { id: "n2", title: "Payout of $420.00 sent", time: "1h" },
  { id: "n3", title: "Budget review is ready", time: "3h" },
];

const NAV_TARGETS = [
  { label: "Dashboard", icon: DashboardIconFull },
  { label: "Transactions", icon: TransactionsIcon },
  { label: "Insights", icon: InsightsIcon },
];

/**
 * Rift Labs top bar: page title, sidebar trigger, global command
 * palette (⌘K), notifications with unread indicator, workspace avatar,
 * and the screen's primary Import action.
 */
export function TopBar({ title }: { title: string }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    const onExternalOpen = () => setPaletteOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("rift:open-palette", onExternalOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("rift:open-palette", onExternalOpen);
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 rounded-t-xl border-b border-line bg-background px-4">
        <SidebarTrigger className="shrink-0 text-muted-foreground" />
        <h1 className="m-0 text-[14px] font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h1>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search or run a command"
            title="Search or run a command (⌘K)"
            className="flex h-8 w-auto cursor-pointer items-center gap-1.5 rounded-md border border-line bg-card px-2 text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#4a55c9] focus-visible:outline-offset-2"
          >
            <SearchIcon />
            <kbd className="rounded border border-line bg-secondary px-1 font-sans text-[11px] text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Notifications, ${NOTIFICATIONS.length} unread`}
                >
                  <span className="relative">
                    <BellIcon />
                    <span
                      aria-hidden="true"
                      className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[#4a55c9] ring-2 ring-white dark:ring-[#121213]"
                    />
                  </span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {NOTIFICATIONS.map((n) => (
                <DropdownMenuItem key={n.id} className="items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#4a55c9]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {n.title}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {n.time} ago
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Account: Acme Retail"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-[#4a55c9] focus-visible:outline-offset-2"
                >
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-secondary text-[11px] font-semibold text-muted-foreground">
                      AR
                    </AvatarFallback>
                  </Avatar>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Acme Retail</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Profile</DropdownMenuItem>
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </header>

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} className="sm:max-w-md">
        <CommandInput placeholder="Search or run a command…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => setPaletteOpen(false)}>
              <UploadIcon />
              <span>Import transactions</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Navigate">
            {NAV_TARGETS.map((t) => (
              <CommandItem key={t.label} onSelect={() => setPaletteOpen(false)}>
                <t.icon />
                <span>{t.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
