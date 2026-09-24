"use client";

import { useRouter } from "next/navigation";
import { SidebarTrigger } from "./ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

import { Button } from "./ui/button";
import { BellIcon } from "./icons";
import { useAttention } from "@/hooks/use-attention";

/**
 * Rift Labs top bar: page title, sidebar trigger, and notifications.
 */
export function TopBar({ title }: { title: string }) {
  const router = useRouter();
  const { items } = useAttention();
  const preview = items.slice(0, 3);
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
                  aria-label={`Notifications, ${items.length} unread`}
                >
                  <span className="relative">
                    <BellIcon />
                    {items.length > 0 ? (
                      <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[#4a55c9] ring-2 ring-white dark:ring-[#121213]"
                      />
                    ) : null}
                  </span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
              {preview.length === 0 ? (
                <p className="m-0 px-2 py-3 text-center text-[12px] text-muted-foreground">
                  You’re all caught up
                </p>
              ) : (
                preview.map((n) => (
                  <DropdownMenuItem key={n.id} className="items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#4a55c9]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {n.title}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {n.sub}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="justify-center gap-1 text-[12px] font-medium text-[#4a55c9]"
                onSelect={() => router.push("/notifications")}
              >
                View all notifications
              </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>


        </div>
      </header>
  );
}
