"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "./use-api";
import { formatCurrency } from "@/lib/format";

/** Reads a persisted string list, tolerating missing or corrupt storage. */
function readStoredList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export const ATTENTION_SYNC_EVENT = "dobby-attention-refresh";

/** Tell every attention consumer to refetch. */
export function requestAttentionSync() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ATTENTION_SYNC_EVENT));
}

const DISMISSED_KEY = "dobby-notifications-dismissed";
const READ_KEY = "dobby-notifications-read";

export interface AttentionItem {
  id: string;
  kind: "review" | "tax";
  title: string;
  sub: string;
  action: string;
  href: string;
}

type ReviewRow = {
  id: string;
  rowNumber: number;
  errorMessage?: string | null;
  status: string;
  proposedData?: { description?: string; merchant?: string; amount?: number; categoryId?: string | null } | null;
  rawData?: { description?: string; merchant?: string; filename?: string; page?: number } | null;
  displayAmount?: number | null;
  displayCurrency?: string | null;
  import?: { originalName?: string | null } | null;
};

/** Plain-language reason a review row needs the user. Null = nothing actionable. */
function reviewReason(row: ReviewRow): string | null {
  const message = row.errorMessage ?? "";
  if (/duplicate transaction fingerprint/i.test(message)) return null;
  if (/password-protected|unlock it/i.test(message)) return "Statement is locked — unlock the file and import it again";
  if (/could not be extracted|no valid transactions|manually/i.test(message)) return "Couldn't read this file — check it or decline it";
  const proposed = row.proposedData;
  if (proposed && !proposed.categoryId) return "Choose a category so it counts toward your totals";
  if (!proposed) return "Confirm the imported transaction details";
  return message || "Confirm the imported transaction details";
}

function reviewTitle(row: ReviewRow): string {
  const proposed = row.proposedData;
  const raw = row.rawData;
  const name =
    proposed?.merchant ??
    proposed?.description ??
    raw?.merchant ??
    raw?.description ??
    row.import?.originalName ??
    "Imported transaction";
  const amount = row.displayAmount ?? proposed?.amount;
  if (typeof amount === "number" && Number.isFinite(amount) && amount !== 0) {
    const formatted = formatCurrency(Math.abs(amount), row.displayCurrency ?? "USD");
    return `${name} · ${formatted}`;
  }
  return name;
}

/**
 * Single source for "needs attention" items across the dashboard card,
 * the top-bar bell, and the notifications center.
 */
export function useAttention() {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [items, setItems] = useState<AttentionItem[]>([]);
  // Read/dismissed state has no server backing, so it lives in localStorage and
  // is read in the initialiser rather than an effect. On the server this yields
  // an empty list, so the affected text is marked suppressHydrationWarning
  // where it renders.
  const [dismissed, setDismissed] = useState<string[]>(() => readStoredList(DISMISSED_KEY));
  const [read, setRead] = useState<string[]>(() => readStoredList(READ_KEY));
  /** Live count of pending review rows, for the sidebar badge. */
  const [reviewCount, setReviewCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const [reviews, checklist] = await Promise.all([
        api.get<{ data: ReviewRow[] }>("/v1/reviews?status=PENDING"),
        api.get<{ data: { items: Array<{ key: string; label: string; status: "READY" | "OUTSTANDING" }> } }>("/v1/tax/checklist"),
      ]);
      setReviewCount(reviews.data.length);
      const reviewItems: AttentionItem[] = reviews.data.slice(0, 20).flatMap((item) => {
        const sub = reviewReason(item);
        if (!sub) return [];
        return [{
          id: `review-${item.id}`,
          kind: "review" as const,
          title: reviewTitle(item),
          sub,
          action: "Review",
          // Deep-link to this specific item so the user lands on the row and can edit it.
          href: `/transactions?view=review&focus=${item.id}`,
        }];
      });
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
    let cancelled = false;
    const load = async () => {
      await refresh();
      if (cancelled) return;
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // A review approved on another page (or another tab) should clear the badge
  // without a reload.
  useEffect(() => {
    const onSync = () => { void refresh(); };
    window.addEventListener("focus", onSync);
    // Approving or declining on the transactions page dispatches this so the
    // sidebar badges clear straight away instead of waiting for a refetch.
    window.addEventListener(ATTENTION_SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener("focus", onSync);
      window.removeEventListener(ATTENTION_SYNC_EVENT, onSync);
    };
  }, [refresh]);

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => {
      const next = current.includes(id) ? current : [...current, id];
      // Persisted so a dismissed item doesn't come back on the next visit.
      try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    setDismissed((current) => {
      const next = [...new Set([...current, ...items.map((item) => item.id)])];
      try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [items]);

  const markRead = useCallback((id: string) => {
    setRead((current) => {
      if (current.includes(id)) return current;
      const next = [...current, id];
      try { window.localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setRead((current) => {
      const next = [...new Set([...current, ...items.map((item) => item.id)])];
      try { window.localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, [items]);

  const visible = items.filter((item) => !dismissed.includes(item.id));
  const unreadCount = visible.filter((item) => !read.includes(item.id)).length;
  return {
    items: visible,
    total: visible.length,
    unreadCount,
    reviewCount,
    isRead: (id: string) => read.includes(id),
    markRead,
    markAllRead,
    dismiss,
    dismissAll,
    refresh,
  };
}
