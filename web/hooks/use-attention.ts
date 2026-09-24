"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "./use-api";

export interface AttentionItem {
  id: string;
  kind: "review" | "tax";
  title: string;
  sub: string;
  action: string;
  href: string;
}

/**
 * Single source for "needs attention" items across the dashboard card,
 * the top-bar bell, and the notifications center.
 */
export function useAttention() {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const [reviews, checklist] = await Promise.all([
        api.get<{ data: Array<{ id: string; rowNumber: number; errorMessage?: string | null; status: string }> }>("/v1/reviews?status=PENDING"),
        api.get<{ data: { items: Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> } }>("/v1/tax/checklist"),
      ]);
      const reviewItems: AttentionItem[] = reviews.data.slice(0, 20).map((item) => ({
        id: `review-${item.id}`,
        kind: "review",
        title: `CSV row ${item.rowNumber} needs review`,
        sub: item.errorMessage ?? "Confirm the imported transaction details",
        action: "Review",
        href: "/transactions",
      }));
      const docs: AttentionItem[] = checklist.data.items
        .filter((item) => item.status === "OUTSTANDING")
        .map((item) => ({
          id: `tax-${item.key}`,
          kind: "tax",
          title: "Tax document outstanding",
          sub: item.label,
          action: "Docs",
          href: "/insights",
        }));
      setItems([...reviewItems, ...docs]);
    } catch {
      setItems([]);
    }
  }, [api, isLoaded, isSignedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const dismissAll = useCallback(() => {
    setDismissed((current) => [...new Set([...current, ...items.map((item) => item.id)])]);
  }, [items]);

  const visible = items.filter((item) => !dismissed.includes(item.id));
  return { items: visible, total: visible.length, dismiss, dismissAll, refresh };
}
