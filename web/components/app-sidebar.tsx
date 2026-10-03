"use client";

import { useEffect, useState } from "react";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,

  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";
import { Button } from "./ui/button";
import { BrandLogo } from "./ui/brand-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { AISidebar, type SidebarResource } from "./agents/ai-sidebar";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@clerk/nextjs";
import { FEATURES } from "@/lib/features";
import { HugeiconsIcon } from "@hugeicons/react";
import { SignOut, SparklesIcon } from "@hugeicons/core-free-icons";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import {
  AccountsIcon,
  BellIcon,
  BookmarkIcon,
  DashboardIconFull,
  EmailIcon,
  GoalsIcon,
  PlusIcon,
  QuestionIcon,
  ReportsIcon,
  SettingsIcon,
  TransactionsIcon,
  UploadIcon,
  WalletIcon,
} from "./icons";
import { useAttention } from "@/hooks/use-attention";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: (props: { className?: string }) => React.ReactNode;
  /** Unread count shown on the right of the row; 0 renders no badge. */
  count?: number;
}

/** Nav renders `<item.icon />` with no props, so the filled bell is bound here. */
const NotificationsNavIcon = (props: { className?: string }) => <BellIcon filled {...props} />;

const MAIN_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: DashboardIconFull },
  { id: "transactions", label: "Transactions", href: "/transactions", icon: TransactionsIcon },
  { id: "insights", label: "Insights", href: "/insights", icon: ReportsIcon },
  { id: "notifications", label: "Notifications", href: "/notifications", icon: NotificationsNavIcon },
  { id: "settings", label: "Settings", href: "/settings", icon: SettingsIcon },
];

function shortAddress(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Workspace tree. Connected accounts lists the user's own wallet addresses
 * (each marked with their accent dot); there are no other workspace folders.
 */
function useWorkspaceResources(): SidebarResource[] {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [wallets, setWallets] = useState<SidebarResource[] | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    void api
      .get<{ data: Array<{ id: string; address: string; color: string }> }>("/v1/wallets")
      .then((response) => {
        if (cancelled) return;
        setWallets(response.data.map((wallet) => ({ id: `wallet-${wallet.id}`, label: shortAddress(wallet.address), kind: "bookmark" as const, color: wallet.color })));
      })
      .catch(() => {
        if (!cancelled) setWallets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, isLoaded, isSignedIn]);

  return [
    {
      id: "connected-accounts",
      label: "Connected accounts",
      kind: "folder",
      children:
        wallets === null
          ? []
          : wallets.length > 0
            ? wallets
            : [{ id: "connect-wallet", label: "Connect a wallet", kind: "bookmark" }],
    },
  ];
}

function NavMenu({ items, activeId, counts, onNavigate }: { items: NavItem[]; activeId: string; counts?: Record<string, number>; onNavigate?: () => void }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = item.id === activeId;
        const internal = item.href.startsWith("/");
        return (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton
            render={internal ? <Link href={item.href} onClick={onNavigate} /> : <a href={item.href} />}
            isActive={active}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            className="h-[28px] rounded-md px-2 text-[13px] font-medium"
          >
            <item.icon />
            <span className="flex-1">{item.label}</span>
            {counts?.[item.id] ? (
              <span
                suppressHydrationWarning
                className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold leading-4 tabular-nums text-primary-foreground"
                aria-label={`${counts[item.id]} unread`}
              >
                {counts[item.id]}
              </span>
            ) : null}
          </SidebarMenuButton>

        </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}


function QuickCreate({ onCreate }: { onCreate: (kind: "import" | "budget" | "goal") => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="secondary" size="icon-sm" aria-label="Create new" title="Create new" className="shrink-0">
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
  );
}

function SidebarNav({ active, onNavigate, onCreate }: { active: string; onNavigate?: () => void; onCreate: (kind: "import" | "budget" | "goal") => void }) {
  // Both badges are live: the transactions row counts pending review rows, the
  // notifications row counts unread attention items. Both fall to zero once
  // everything is dealt with.
  const { unreadCount, reviewCount } = useAttention();
  const counts: Record<string, number> = { transactions: reviewCount, notifications: unreadCount };
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { signOut } = useClerk();
  const router = useRouter();
  const resources = useWorkspaceResources();

  return (
    <>
      <SidebarHeader className="px-3 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1"
            aria-label="Brand logo"
          >
            <BrandLogo size={28} />

          </div>
          <QuickCreate onCreate={onCreate} />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup className="px-0 py-1">
          <SidebarGroupContent>
            <NavMenu items={MAIN_NAV} activeId={active} counts={counts} onNavigate={onNavigate} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-0 py-1">
          <SidebarGroupLabel className="h-7 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <AISidebar
              items={resources}
              defaultExpandedIds={["connected-accounts"]}
              defaultActiveId={active}
              ariaLabel="Connected accounts"
              className="gap-0.5"
              renderIcon={(item) => {
                if (item.id === "connected-accounts") return <AccountsIcon />;
                if (item.id.startsWith("wallet-")) {
                  // Each wallet carries the colour chosen for it in Settings;
                  // fall back to the global accent only if it has none.
                  return <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: item.color ?? "var(--brand)" }} />;
                }
                if (item.id === "connect-wallet") return <WalletIcon />;
                return <BookmarkIcon />;
              }}
              onActiveChange={(id) => {
                if (id.startsWith("wallet-")) {
                  router.push("/transactions?source=wallet");
                  return;
                }
                const hrefs: Record<string, string> = {
                  "connect-wallet": "/settings",
                };
                const href = hrefs[id];
                if (href) router.push(href);
              }}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3">
        {/* Help lives in the footer where log out used to be; log out moved to
            the top bar. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex h-7 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <QuestionIcon className="size-4 shrink-0" />
                <span className="flex-1 truncate">Help</span>
              </button>
            }
          />
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem onClick={() => window.open("mailto:support@riftlabs.xyz?subject=Dobby%20support", "_self")} className="items-start gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"><EmailIcon className="size-3.5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">Contact support</span>
                <span className="block text-[11px] text-muted-foreground">Email us and we&apos;ll reply</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open("mailto:support@riftlabs.xyz?subject=Dobby%20feedback", "_self")} className="items-start gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"><HugeiconsIcon icon={SparklesIcon} size={14} aria-hidden="true"  /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">Send feedback</span>
                <span className="block text-[11px] text-muted-foreground">Tell us what to build next</span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLogoutOpen(true)} className="text-destructive focus:text-destructive data-[variant=destructive]:*:[svg]:text-destructive">
              <HugeiconsIcon icon={SignOut} className="size-4 shrink-0"  />
              <span className="flex-1">Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
          <AlertDialogContent className="z-[100]">
            <AlertDialogHeader>
              <AlertDialogTitle>Log out of Dobby?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to log out of Dobby?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => { setLogoutOpen(false); void signOut(); }}>Log out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarFooter>
    </>
  );
}

interface AppSidebarProps {
  active: string;
  onCreate: (kind: "import" | "budget" | "goal") => void;
  peek: boolean;
  onPeekChange: (peek: boolean) => void;
}

/**
 * Rift Labs rail on the shadcn Sidebar foundation: transparent background
 * flush to the screen edge, offcanvas collapse, floating variant styling
 * reserved for the hover peek panel.
 */
export function AppSidebar({ active, peek, onPeekChange, onCreate }: AppSidebarProps) {
  const reduce = useReducedMotion() ?? false;
  const { open } = useSidebar();
  const showPeek = peek && !open;

  useEffect(() => {
    if (!showPeek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPeekChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showPeek, onPeekChange]);

  return (
    <>
      <Sidebar
        variant="sidebar"
        collapsible="offcanvas"
        className="border-r-0"
        style={{ borderRightWidth: 0 }}
      >
        <SidebarNav active={active} onNavigate={() => onPeekChange(false)} onCreate={onCreate} />
      </Sidebar>

      {/* Edge hover-strip: opens the floating sidebar while collapsed */}
      <HoverStrip onPeek={() => onPeekChange(true)} />

      <AnimatePresence>
        {showPeek ? (
          <motion.aside
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onMouseLeave={() => onPeekChange(false)}
            className="fixed top-2 bottom-2 left-2 z-50 hidden w-[248px] flex-col overflow-hidden rounded-[12px] border border-line bg-background shadow-[0_16px_48px_rgb(23_24_28/0.18),0_4px_12px_rgb(23_24_28/0.1)] md:flex"
            aria-label="Sidebar preview"
          >
            <SidebarNav active={active} onNavigate={() => onPeekChange(false)} onCreate={onCreate} />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function HoverStrip({ onPeek }: { onPeek: () => void }) {
  const { open } = useSidebar();
  if (open) return null;
  return (
    <div
      aria-hidden="true"
      onMouseEnter={onPeek}
      className="fixed inset-y-0 left-0 z-40 hidden w-3 md:block"
    />
  );
}
