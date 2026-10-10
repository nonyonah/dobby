"use client";

import { usePathname } from "next/navigation";
import { Shell, type ShellActive } from "@/components/shell";

/**
 * Path → shell title. Keyed by prefix rather than exact pathname so dynamic
 * routes (`/wallets/<id>`) resolve without every wallet needing its own entry.
 * Longest prefix wins, which is what keeps `/settings/categories-rules` from
 * being swallowed by `/settings`.
 */
const ROUTES: Array<[prefix: string, title: string, active: ShellActive]> = [
  ["/app", "Dashboard", "dashboard"],
  ["/transactions", "Transactions", "transactions"],
  ["/insights", "Insights", "insights"],
  ["/budget/goals", "Goals", "goals"],
  ["/budget", "Budget", "budget"],
  ["/settings/categories-rules", "Categories & Rules", "settings"],
  ["/settings", "Settings", "settings"],
  ["/notifications", "Notifications", "notifications"],
  // A wallet is a detail view reached from the Connected accounts tree in the
  // sidebar, not a top-level destination — there is deliberately no nav row for
  // it, so `wallets` highlights nothing in the main nav.
  ["/wallets", "Wallet", "wallets"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  let match: { title: string; active: ShellActive } | null = null;
  let matchedLength = -1;
  for (const [prefix, title, active] of ROUTES) {
    const hit = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (hit && prefix.length > matchedLength) {
      match = { title, active };
      matchedLength = prefix.length;
    }
  }

  return (
    <Shell title={match?.title ?? "Dashboard"} active={match?.active ?? "dashboard"}>
      {children}
    </Shell>
  );
}