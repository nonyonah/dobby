"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { HugeiconsIcon } from "@hugeicons/react";
import { SignOut } from "@hugeicons/core-free-icons";
import { GoalsIcon, PlusIcon, UploadIcon, WalletIcon } from "./icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { SidebarTrigger } from "./ui/sidebar";
import { GetStarted } from "@/components/onboarding/get-started";
import { TrialPill } from "@/components/trial-pill";
import { FEATURES } from "@/lib/features";

import { Button } from "./ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";

/**
 * Rift Labs top bar: page title, sidebar trigger, and the things worth doing.
 * The greeting and net worth live on the homepage, above the income card.
 *
 * The create menu and the trial pill both live here rather than in the sidebar
 * because neither is reachable otherwise on a phone: the sidebar collapses behind
 * a hamburger, so "import my statement" and "start your free trial" both ended up
 * invisible to anyone not already holding the app open on a desktop.
 */
export function TopBar({
  title,
  onCreate,
}: {
  title: string;
  onCreate: (kind: "import" | "budget" | "goal") => void;
}) {
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
          {/* How much trial is left, beside the button that starts it. The two
              are the same decision, so they sit together: a countdown floating
              on the dashboard told people they had time without ever saying how
              to get the thing it was counting down to. */}
          <TrialPill className="hidden sm:inline-flex" />
          <GetStarted />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="secondary" size="icon-sm" aria-label="Create new" title="Create new" data-tour="quick-create" className="shrink-0">
                  <PlusIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onCreate("import")}>
                <UploadIcon />
                <span>Import transaction</span>
              </DropdownMenuItem>
              {FEATURES.budgeting ? (
                <DropdownMenuItem onClick={() => onCreate("budget")}>
                  <WalletIcon />
                  <span>Create a budget</span>
                </DropdownMenuItem>
              ) : null}
              {FEATURES.goals ? (
                <DropdownMenuItem onClick={() => onCreate("goal")}>
                  <GoalsIcon />
                  <span>Create a goal</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

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
