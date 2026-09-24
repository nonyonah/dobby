"use client";

import { ToastProvider, toast as heroToast } from "@heroui/react";

function show(message: string, variant: "success" | "danger") {
  let id = "";
  id = heroToast(message, {
    variant,
    actionProps: {
      children: "Dismiss",
      variant: "primary",
      onPress: () => heroToast.close(id),
    },
  });
}

export const toast = {
  success: (message: string) => show(message, "success"),
  error: (message: string) => show(message, "danger"),
};

export function Toaster() {
  return <ToastProvider placement="bottom" maxVisibleToasts={3} />;
}
