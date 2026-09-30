"use client";

import * as React from "react";
import { ToastProvider, addToast } from "@heroui/toast";

/**
 * The app's toast surface, backed by HeroUI's toast so it inherits the HeroUI
 * variants rather than a hand-rolled look.
 *
 * The imperative `toast.success(...)` API is kept so the existing call sites stay
 * unchanged. The provider is mounted once in the root layout, which is what
 * `addToast` needs in order to render.
 *
 * Status needs two props, because HeroUI splits the job. `severity` selects the
 * status icon (`severity ? iconMap[severity] : iconMap[color]`), while `color`
 * paints the surface from the toast's `flat`/`solid`/`bordered` variants. Passing
 * only `color` left `toast.info` with HeroUI's default information icon rather
 * than its `primary` one, and overriding `icon` suppressed the lookup entirely.
 * Neither is overridden here — HeroUI's own icons and variants do the work.
 */

export interface ToastOptions {
  description?: React.ReactNode;
  /** Renders a call-to-action button, e.g. a retry affordance. */
  action?: { label: string; onPress: () => void };
  /** Milliseconds before auto-dismiss. Omit for the 6s default, 0 to keep it open. */
  timeout?: number;
}

/** One name per status: it is both a HeroUI `severity` and a HeroUI `color`. */
type Variant = "success" | "danger" | "primary" | "warning";

function show(message: string, variant: Variant, options?: ToastOptions) {
  return addToast({
    title: message,
    description: options?.description,
    severity: variant,
    color: variant,
    ...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
    ...(options?.action
      ? {
          endContent: (
            <button
              type="button"
              onClick={options.action.onPress}
              className="shrink-0 cursor-pointer rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {options.action.label}
            </button>
          ),
        }
      : {}),
  });
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show(message, "success", options),
  error: (message: string, options?: ToastOptions) => show(message, "danger", options),
  info: (message: string, options?: ToastOptions) => show(message, "primary", options),
  warning: (message: string, options?: ToastOptions) => show(message, "warning", options),
};

/** Mount once at the app root. */
export function Toaster() {
  return <ToastProvider />;
}
