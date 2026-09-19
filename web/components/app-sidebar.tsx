"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
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
import {
  BudgetIcon,
  DashboardIconFull,
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
  count?: number;
  countLabel?: string;
}

const MAIN_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: DashboardIconFull },
  { id: "transactions", label: "Transactions", href: "/transactions", icon: TransactionsIcon, count: 8, countLabel: "8 pending" },
  { id: "insights", label: "Insights", href: "/insights", icon: ReportsIcon, count: 3, countLabel: "3 unread" },
  { id: "budget", label: "Budget", href: "/budget", icon: BudgetIcon },
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
            aria-label={
              item.count !== undefined
                ? `${item.label}, ${item.countLabel}`
                : item.label
            }
            className="h-[28px] rounded-md px-2 text-[13px] font-medium"
          >
            <item.icon />
            <span className="flex-1">{item.label}</span>
          </SidebarMenuButton>
          {item.count !== undefined && (
            <SidebarMenuBadge className="bg-transparent text-[12px] font-normal text-[#8a8b91] dark:text-[#a2a3a8]">
              {item.count > 99 ? "99+" : item.count}
            </SidebarMenuBadge>
          )}
        </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function QuickCreate() {
  const router = useRouter();
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
        <DropdownMenuItem onSelect={() => router.push("/transactions?modal=import")}>
          <UploadIcon />
          <span>Import transaction</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/budget?create=1")}>
          <WalletIcon />
          <span>Create a budget</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarNav({ active, onNavigate }: { active: string; onNavigate?: () => void }) {
  return (
    <>
      <SidebarHeader className="px-3 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <div
            className="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1"
            aria-label="Workspace: Rift labs"
          >
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] bg-[#c8b93c] text-[10px] font-bold text-white"
            >
              RL
            </span>
            <span className="truncate text-[13px] font-medium text-[#1c1d20] dark:text-[#eceef0]">
              Rift labs
            </span>
          </div>
          <QuickCreate />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup className="px-0 py-1">
          <SidebarGroupContent>
            <NavMenu items={MAIN_NAV} activeId={active} onNavigate={onNavigate} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a href="#" />}
              className="h-[28px] rounded-md px-2 text-[13px] font-medium"
            >
              <SettingsIcon />
              <span className="flex-1">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

interface AppSidebarProps {
  active: string;
  peek: boolean;
  onPeekChange: (peek: boolean) => void;
}

/**
 * Rift Labs rail on the shadcn Sidebar foundation: transparent background
 * flush to the screen edge, offcanvas collapse, floating variant styling
 * reserved for the hover peek panel.
 */
export function AppSidebar({ active, peek, onPeekChange }: AppSidebarProps) {
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
        <SidebarNav active={active} onNavigate={() => onPeekChange(false)} />
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
            className="fixed top-2 bottom-2 left-2 z-50 hidden w-[248px] flex-col overflow-hidden rounded-[12px] border border-[#e0ddd7] dark:border-[#2d2d31] bg-[#F9FAFB] dark:bg-[#121213] shadow-[0_16px_48px_rgba(23,24,28,0.18),0_4px_12px_rgba(23,24,28,0.1)] md:flex"
            aria-label="Sidebar preview"
          >
            <SidebarNav active={active} onNavigate={() => onPeekChange(false)} />
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
