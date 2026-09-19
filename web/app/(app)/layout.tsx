"use client";

import { usePathname } from "next/navigation";
import { Shell } from "@/components/shell";

const TITLES: Record<string, { title: string; active: "dashboard" | "transactions" | "insights" | "budget" | "goals" | "settings" }> = {
  "/": { title: "Dashboard", active: "dashboard" },
  "/transactions": { title: "Transactions", active: "transactions" },
  "/insights": { title: "Insights", active: "insights" },
  "/budget": { title: "Budget", active: "budget" },
    "/budget/goals": { title: "Goals", active: "goals" },
  "/settings": { title: "Settings", active: "settings" },
  "/settings/categories-rules": { title: "Categories & Rules", active: "settings" },
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
