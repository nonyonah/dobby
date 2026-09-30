"use client";

import * as React from "react";
import { Toast as HeroToast, toast as herouiToast } from "@heroui/react";

/**
 * Toasts, on HeroUI v3's `Toast`.
 *
 * Toasts are only for states that have already resolved: the save, archive,
 * delete or import succeeded, or a failed action's one-line reason. Anything the
 * user still has to act on belongs in an `Alert` instead — see
 * `components/ui/alert.tsx` for that split.
 *
 * HeroUI owns the queue, placement, exit animation, stacking and ARIA wiring;
 * this file is the imperative shim so the existing `toast.success(...)` call
 * sites stay unchanged.
 *
 * Two API differences worth knowing, since the v3 names moved:
 *  - `error` became `danger`, and `info` became `accent`. The local names are
 *    kept so no call site had to change.
 *  - The auto-dismiss prop is `timeout`, defaulting to 4s; `0` keeps it open.
 */

export interface ToastOptions {
  description?: React.ReactNode;
  /** Renders a call-to-action button, e.g. a retry affordance. */
  action?: { label: string; onPress: () => void };
  /** Milliseconds before auto-dismiss. Omit for the 4s default, 0 to keep it open. */
  timeout?: number;
  onClose?: () => void;
}

function toHeroOptions(options?: ToastOptions) {
  return {
    ...(options?.description !== undefined ? { description: options.description } : {}),
    ...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
    ...(options?.action ? { actionProps: { children: options.action.label, onPress: options.action.onPress } } : {}),
    ...(options?.onClose ? { onClose: options.onClose } : {}),
  };
}

export const toast = {
  success: (message: string, options?: ToastOptions) => herouiToast.success(message, toHeroOptions(options)),
  error: (message: string, options?: ToastOptions) => herouiToast.danger(message, toHeroOptions(options)),
  info: (message: string, options?: ToastOptions) => herouiToast.info(message, toHeroOptions(options)),
  warning: (message: string, options?: ToastOptions) => herouiToast.warning(message, toHeroOptions(options)),
  /** Dismiss a specific toast, e.g. to collapse an optimistic one once a retry succeeds. */
  close: (key: string) => herouiToast.close(key),
};

/**
 * Mount once at the app root.
 *
 * `width` is what keeps a toast from spanning the viewport: HeroUI's region is a
 * fixed, full-bleed wrapper and the card is sized by this prop. Left to itself it
 * falls back to a fraction of the screen, which is what made the toast read as a
 * squared bar across the window.
 */
export function Toaster() {
  return (
    <HeroToast.Provider
      placement="bottom end"
      width={400}
      gap={10}
      maxVisibleToasts={3}
    />
  );
}
