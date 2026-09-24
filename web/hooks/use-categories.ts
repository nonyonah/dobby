"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "./use-api";

export interface CategoryOption {
  id: string;
  name: string;
  color: string | null;
  emoji: string;
}

const EMOJI_BY_NAME: Record<string, string> = {
  housing: "🏠",
  groceries: "🛒",
  transport: "🚕",
  dining: "🍽",
  shopping: "🛍",
  education: "📚",
  income: "💵",
  investments: "📈",
  utilities: "💡",
  other: "📦",
};

export function emojiForCategory(name: string): string {
  return EMOJI_BY_NAME[name.toLowerCase()] ?? "📦";
}

interface ApiCategory {
  id: string;
  name: string;
  color?: string | null;
  isArchived?: boolean;
}

/**
 * Live category list for every dropdown in the app. Archived categories
 * are filtered out; unknown names fall back to a neutral emoji so newly
 * created categories always appear. Call refresh() after creating or
 * archiving a category elsewhere.
 */
export function useCategories() {
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const refresh = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const response = await api.get<{ data: ApiCategory[] }>("/v1/categories");
      setCategories(
        response.data
          .filter((category) => !category.isArchived)
          .map((category) => ({
            id: category.id,
            name: category.name,
            color: category.color ?? null,
            emoji: emojiForCategory(category.name),
          })),
      );
    } catch {
      // Callers fall back to fixture lists; a failed refresh keeps the last list.
    }
  }, [api, isLoaded, isSignedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { categories, refresh };
}
