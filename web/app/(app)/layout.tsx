"use client";

import { usePathname } from "next/navigation";
import { Shell } from "@/components/shell";

const TITLES: Record<string, { title: string; active: "dashboard" | "transactions" | "insights" | "budget" }> = {
  "/": { title: "Dashboard", active: "dashboard" },
  "/transactions": { title: "Transactions", active: "transactions" },
  "/insights": { title: "Insights", active: "insights" },
  "/budget": { title: "Budget", active: "budget" },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const match = TITLES[pathname] ?? { title: "Dashboard", active: "dashboard" as const };
  return (
    <Shell title={match.title} active={match.active}>
      {children}
    </Shell>
  );
}
