"use client";

import type { ReactNode } from "react";
import { ToastProvider, toast as heroToast } from "@heroui/react";

type Variant = "success" | "danger" | "accent" | "warning";

export interface ToastOptions {
  description?: ReactNode;
  /** Renders a call-to-action button, e.g. a retry affordance. */
  action?: { label: string; onPress: () => void };
  /** Milliseconds before auto-dismiss. Omit for the default, 0 to keep it open. */
  timeout?: number;
}

function show(message: string, variant: Variant, options?: ToastOptions) {
  return heroToast(message, {
    variant,
    description: options?.description,
    timeout: options?.timeout,
    actionProps: options?.action
      ? { children: options.action.label, onPress: options.action.onPress, variant: "primary" }
      : undefined,
  });
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show(message, "success", options),
  error: (message: string, options?: ToastOptions) => show(message, "danger", options),
  info: (message: string, options?: ToastOptions) => show(message, "accent", options),
  warning: (message: string, options?: ToastOptions) => show(message, "warning", options),
};

export function Toaster() {
  return <ToastProvider placement="bottom" maxVisibleToasts={3} />;
}
