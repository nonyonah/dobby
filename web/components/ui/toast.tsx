"use client";

import * as React from "react";
import { ToastProvider, addToast } from "@heroui/toast";
import { CheckCircle, Info, Warning, XCircle } from "@phosphor-icons/react/dist/ssr";

/**
 * The app's toast surface. Backed by HeroUI's toast so the look and feel match
 * the rest of the HeroUI-backed surfaces; the imperative `toast.success(...)`
 * API is kept so the ~20 call sites stay unchanged.
 *
 * The provider is mounted once in the root layout, which is what `addToast`
 * needs in order to render.
 */

export interface ToastOptions {
  description?: React.ReactNode;
  /** Renders a call-to-action button, e.g. a retry affordance. */
  action?: { label: string; onPress: () => void };
  /** Milliseconds before auto-dismiss. Omit for the default, 0 to keep it open. */
  timeout?: number;
}

type Variant = "success" | "danger" | "accent" | "warning";

// Bold weights so the status icon reads clearly at the toast's small size.
const VARIANT: Record<Variant, { color: "success" | "danger" | "primary" | "warning"; icon: React.ReactNode }> = {
  success: { color: "success", icon: <CheckCircle size={22} weight="fill" className="text-success" /> },
  danger: { color: "danger", icon: <XCircle size={22} weight="fill" className="text-destructive" /> },
  accent: { color: "primary", icon: <Info size={22} weight="fill" className="text-primary" /> },
  warning: { color: "warning", icon: <Warning size={22} weight="fill" className="text-warning" /> },
};

function show(message: string, variant: Variant, options?: ToastOptions) {
  return addToast({
    title: message,
    description: options?.description,
    color: VARIANT[variant].color,
    icon: VARIANT[variant].icon,
    ...(options?.timeout !== undefined ? { duration: options.timeout } : {}),
    ...(options?.action
      ? {
          endContent: (
            <button
              type="button"
              onClick={options.action.onPress}
              className="shrink-0 cursor-pointer rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium text-foreground outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
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
  info: (message: string, options?: ToastOptions) => show(message, "accent", options),
  warning: (message: string, options?: ToastOptions) => show(message, "warning", options),
};

/** Mount once at the app root. */
export function Toaster() {
  return <ToastProvider />;
}
