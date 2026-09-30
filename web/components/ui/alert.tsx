"use client";

import * as React from "react";
import { cn } from "cn";

type AlertStatus = "default" | "success" | "warning" | "danger";

const STATUS_CLASSES: Record<AlertStatus, string> = {
  default: "border-line bg-card text-foreground",
  success: "border-success/40 bg-success-soft text-foreground",
  warning: "border-warning/40 bg-warning-soft text-foreground",
  danger: "border-destructive/40 bg-destructive/10 text-foreground",
};

type AlertProps = React.ComponentProps<"div"> & {
  status?: AlertStatus;
};

function Alert({ className, status = "default", ...props }: AlertProps) {
  return <div data-slot="alert" data-status={status} className={cn("rounded-[50px] border px-3 py-2.5 text-xs", STATUS_CLASSES[status], className)} {...props} />;
}

function AlertIndicator({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="alert-indicator" className={cn("text-current", className)} {...props} />;
}

function AlertContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-content" className={cn("min-w-0", className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-medium", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-muted-foreground", className)} {...props} />;
}

export { Alert, AlertIndicator, AlertContent, AlertTitle, AlertDescription };
