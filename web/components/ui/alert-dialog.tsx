"use client";

import * as React from "react";
import { AlertDialog as HeroAlertDialog } from "@heroui/react";
import { cn } from "cn";

interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  return <HeroAlertDialog.Root isOpen={open} onOpenChange={onOpenChange}>{children}</HeroAlertDialog.Root>;
}

function AlertDialogTrigger(props: React.ComponentProps<typeof HeroAlertDialog.Trigger>) {
  return <HeroAlertDialog.Trigger {...props} />;
}

function AlertDialogContent({ className, children, ...props }: Omit<React.ComponentProps<typeof HeroAlertDialog.Container>, "children"> & { children?: React.ReactNode }) {
  return <><HeroAlertDialog.Backdrop /><HeroAlertDialog.Container placement="center" size="md" className={cn("z-50 w-full max-w-[calc(100%-2rem)]", className)} {...props}><HeroAlertDialog.Dialog className="grid gap-4 rounded-xl border border-line bg-popover p-4 text-xs text-popover-foreground shadow-none outline-none">{children}</HeroAlertDialog.Dialog></HeroAlertDialog.Container></>;
}

function AlertDialogHeader(props: React.ComponentProps<typeof HeroAlertDialog.Header>) {
  return <HeroAlertDialog.Header {...props} />;
}
function AlertDialogTitle(props: React.ComponentProps<typeof HeroAlertDialog.Heading>) {
  return <HeroAlertDialog.Heading className="text-sm font-medium" {...props} />;
}
function AlertDialogDescription(props: React.ComponentProps<typeof HeroAlertDialog.Body>) {
  return <HeroAlertDialog.Body className="text-xs/relaxed text-muted-foreground" {...props} />;
}
function AlertDialogFooter(props: React.ComponentProps<typeof HeroAlertDialog.Footer>) {
  return <HeroAlertDialog.Footer className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" {...props} />;
}
function AlertDialogAction(props: React.ComponentProps<typeof HeroAlertDialog.CloseTrigger>) {
  return <HeroAlertDialog.CloseTrigger {...props} />;
}
function AlertDialogCancel(props: React.ComponentProps<typeof HeroAlertDialog.CloseTrigger>) {
  return <HeroAlertDialog.CloseTrigger {...props} />;
}

export { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel };
