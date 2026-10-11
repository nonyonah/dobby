"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { HugeiconsIcon } from "@hugeicons/react";
import { SignOut } from "@hugeicons/core-free-icons";
import { SidebarTrigger } from "./ui/sidebar";
import { GetStarted } from "@/components/onboarding/get-started";

import { Button } from "./ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";

/**
 * Rift Labs top bar: page title, sidebar trigger, and notifications.
 * The greeting and net worth live on the homepage, above the income card.
 */
export function TopBar({ title }: { title: string }) {
  const { signOut } = useClerk();
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
      <header className="z-30 flex h-12 shrink-0 items-center gap-2 rounded-t-xl border-b border-line bg-background px-4">
        <SidebarTrigger className="shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[14px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </h1>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Setup pill sits immediately before log out: it is the last thing
              left to do, so it belongs at the end of the bar rather than in the
              content, where it was one scroll away from being missed. */}
          <GetStarted />
          {/* Notifications moved into the sidebar; the bell's slot is now log
              out, and the footer holds Help. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLogoutOpen(true)}
            aria-label="Log out"
            title="Log out"
            className="text-muted-foreground hover:text-destructive"
          >
            <HugeiconsIcon icon={SignOut} strokeWidth={2} size={16} aria-hidden="true"  />
          </Button>
          <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
            <AlertDialogContent className="z-[100]">
              <AlertDialogHeader>
                <AlertDialogTitle>Log out of Dobby?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will need to sign in again to reach your workspace.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => { setLogoutOpen(false); void signOut(); }}>
                  Log out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>
  );
}
