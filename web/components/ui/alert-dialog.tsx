"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { cn } from "cn";

interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

const AlertDialogCloseContext = React.createContext<(() => void) | null>(null);

function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  const close = React.useCallback(() => onOpenChange?.(false), [onOpenChange]);
  return (
    <AlertDialogCloseContext.Provider value={close}>
      <Dialog open={open} onOpenChange={onOpenChange}>{children}</Dialog>
    </AlertDialogCloseContext.Provider>
  );
}

function AlertDialogTrigger(props: React.ComponentProps<"button">) {
  return <button type="button" {...props} />;
}

function AlertDialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogContent>) {
  return <DialogContent showCloseButton={false} className={className} {...props}>{children}</DialogContent>;
}

function AlertDialogHeader(props: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader {...props} />;
}

function AlertDialogTitle(props: React.ComponentProps<typeof DialogTitle>) {
  return <DialogTitle {...props} />;
}

function AlertDialogDescription(props: React.ComponentProps<typeof DialogDescription>) {
  return <DialogDescription {...props} />;
}

function AlertDialogFooter(props: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter {...props} />;
}

type AlertActionProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `destructive` for irreversible confirmations such as logging out. */
  variant?: "primary" | "destructive";
};

function AlertDialogAction({ className, onClick, children, variant = "primary", ...props }: AlertActionProps) {
  const close = React.useContext(AlertDialogCloseContext);
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 cursor-pointer items-center justify-center rounded-md px-3 text-xs font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        variant === "destructive"
          ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          : "bg-primary text-primary-foreground hover:opacity-90",
        className,
      )}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) close?.();
      }}
    >
      {children}
    </button>
  );
}

function AlertDialogCancel({ className, onClick, children, ...props }: AlertActionProps) {
  const close = React.useContext(AlertDialogCloseContext);
  return (
    <button
      type="button"
      className={cn("inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-line bg-transparent px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2", className)}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) close?.();
      }}
    >
      {children}
    </button>
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
};
