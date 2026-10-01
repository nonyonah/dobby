"use client";

import { useSyncExternalStore } from "react";
import { CURRENCY_EVENT, readStoredCurrency } from "@/lib/format";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CURRENCY_EVENT, onStoreChange);
  // Another tab changing the preference shouldn't leave this one wearing the old symbol.
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(CURRENCY_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/* Both return the same primitive for repeated calls, which is what lets
 * useSyncExternalStore compare snapshots without re-rendering forever. */
const getSnapshot = () => readStoredCurrency() ?? "NGN";
const getServerSnapshot = () => "NGN";

/**
 * The display currency, re-rendering the caller when it changes.
 *
 * The preference lives in localStorage and is read imperatively, so a view that
 * mounted before the change keeps rendering the previous symbol until something
 * unrelated re-renders it. Prefer this over `getAppCurrency()` anywhere the value
 * reaches rendered output; the plain function is still right for one-off reads
 * inside event handlers.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` because the server
 * has no localStorage: it renders "NGN" and swaps to the stored value after
 * hydration, instead of risking a markup mismatch on the first client render.
 */
export function useAppCurrency(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
