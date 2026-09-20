"use client";

import { SidebarTrigger } from "./ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

import { Button } from "./ui/button";
import { BellIcon } from "./icons";

const NOTIFICATIONS = [
  { id: "n1", title: "Invoice #0192 was paid", time: "2m" },
  { id: "n2", title: "Payout of $420.00 sent", time: "1h" },
  { id: "n3", title: "Budget review is ready", time: "3h" },
];

/**
 * Rift Labs top bar: page title, sidebar trigger, and notifications.
 */
export function TopBar({ title }: { title: string }) {
  return (
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 rounded-t-xl border-b border-line bg-background px-4">
        <SidebarTrigger className="shrink-0 text-muted-foreground" />
        <h1 className="m-0 text-[14px] font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h1>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">

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


        </div>
      </header>
  );
}
