"use client";

import { useEffect, useState } from "react";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { AISidebar, type SidebarResource } from "./agents/ai-sidebar";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import {
  AccountsIcon,
  BellIcon,
  BookmarkIcon,
  BudgetIcon,
  DashboardIconFull,
  GoalsIcon,
  PlusIcon,
  ReportsIcon,
  SettingsIcon,
  TransactionsIcon,
  UploadIcon,
  WalletIcon,
} from "./icons";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: (props: { className?: string }) => React.ReactNode;

}

const MAIN_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: DashboardIconFull },
  { id: "transactions", label: "Transactions", href: "/transactions", icon: TransactionsIcon },
  { id: "insights", label: "Insights", href: "/insights", icon: ReportsIcon },
  { id: "budget", label: "Budget", href: "/budget", icon: BudgetIcon },
  { id: "goals", label: "Goals", href: "/budget/goals", icon: GoalsIcon },
  { id: "notifications", label: "Notifications", href: "/notifications", icon: (props) => <BellIcon {...props} filled /> },
];

const SIDEBAR_RESOURCES: SidebarResource[] = [
  {
    id: "connected-accounts",
    label: "Connected accounts",
    kind: "folder",
    children: [
      { id: "wallet-activity", label: "Wallet activity", kind: "bookmark" },
      { id: "business-account", label: "Business account", kind: "bookmark" },
    ],
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    kind: "folder",
    children: [
      { id: "category-rules", label: "Category rules", kind: "bookmark" },
      { id: "recent-insights", label: "Recent insights", kind: "bookmark" },
      { id: "monthly-budget", label: "Monthly budget", kind: "bookmark" },
    ],
  },
];

function NavMenu({ items, activeId, onNavigate }: { items: NavItem[]; activeId: string; onNavigate?: () => void }) {
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
        <DropdownMenuItem onClick={() => onCreate("budget")}>
          <WalletIcon />
          <span>Create a budget</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCreate("goal")}>
          <GoalsIcon />
          <span>Create a goal</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarNav({ active, onNavigate, onCreate }: { active: string; onNavigate?: () => void; onCreate: (kind: "import" | "budget" | "goal") => void }) {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { signOut } = useClerk();

  return (
    <>
      <SidebarHeader className="px-3 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1"
            aria-label="Brand logo"
          >
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-[#83c5be] text-[10px] font-bold text-white"
            >
              RL
            </span>

          </div>
          <QuickCreate onCreate={onCreate} />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup className="px-0 py-1">
          <SidebarGroupContent>
            <NavMenu items={MAIN_NAV} activeId={active} onNavigate={onNavigate} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-0 py-1">
          <SidebarGroupLabel className="h-7 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <AISidebar
              defaultItems={SIDEBAR_RESOURCES}
              defaultExpandedIds={["connected-accounts", "bookmarks"]}
              defaultActiveId={active}
              ariaLabel="Connected accounts and bookmarks"
              className="gap-0.5"
              renderIcon={(item) => {
                if (item.id === "connected-accounts") return <AccountsIcon />;
                if (item.id === "bookmarks") return <BookmarkIcon />;
                if (item.id === "wallet-activity") return <WalletIcon />;
                if (item.id === "business-account") return <AccountsIcon />;
                if (item.id === "recent-insights") return <ReportsIcon />;
                return <BookmarkIcon />;
              }}
              onActiveChange={(id) => {
                const hrefs: Record<string, string> = {
                  "wallet-activity": "/transactions?source=wallet",
                  "business-account": "/insights?account=business",
                  "category-rules": "/settings/categories-rules",
                  "recent-insights": "/insights",
                  "monthly-budget": "/budget",
                };
                const href = hrefs[id];
                if (href) window.location.assign(href);
              }}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/settings" />}
              isActive={active === "settings"}
              aria-current={active === "settings" ? "page" : undefined}
              className="h-[28px] rounded-md px-2 text-[13px] font-medium"
            >
              <SettingsIcon />
              <span className="flex-1">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              className="flex h-7 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <SignOut className="size-4 shrink-0" />
              <span className="flex-1 truncate">Log out</span>
            </button>
          </SidebarMenuItem>
        </SidebarMenu>
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
              <AlertDialogAction onClick={() => { setLogoutOpen(false); void signOut(); }}>Log out</AlertDialogAction>
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
