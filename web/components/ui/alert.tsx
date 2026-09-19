"use client";

import * as React from "react";
import { Alert as HeroAlert } from "@heroui/react";
import { cn } from "cn";

type AlertProps = React.ComponentProps<typeof HeroAlert>;

function Alert({ className, status = "default", ...props }: AlertProps) {
  return <HeroAlert status={status} className={cn("rounded-xl border border-line bg-card px-3 py-2.5 text-xs", className)} {...props} />;
}

function AlertIndicator({ className, ...props }: React.ComponentProps<typeof HeroAlert.Indicator>) {
  return <HeroAlert.Indicator className={cn("text-current", className)} {...props} />;
}

function AlertContent({ className, ...props }: React.ComponentProps<typeof HeroAlert.Content>) {
  return <HeroAlert.Content className={cn("min-w-0", className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<typeof HeroAlert.Title>) {
  return <HeroAlert.Title className={cn("font-medium", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<typeof HeroAlert.Description>) {
  return <HeroAlert.Description className={cn("text-muted-foreground", className)} {...props} />;
}

export { Alert, AlertIndicator, AlertContent, AlertTitle, AlertDescription };
