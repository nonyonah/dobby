"use client";

import * as React from "react";
import { Modal as HeroModal } from "@heroui/react";
import { cn } from "cn";
import { X } from "@phosphor-icons/react/dist/ssr";

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  return <HeroModal.Root isOpen={open} onOpenChange={onOpenChange}>{children}</HeroModal.Root>;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof HeroModal.Trigger>) {
  return <HeroModal.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function DialogClose({ ...props }: React.ComponentProps<typeof HeroModal.CloseTrigger>) {
  return <HeroModal.CloseTrigger data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof HeroModal.Backdrop>) {
  return <HeroModal.Backdrop data-slot="dialog-overlay" className={cn("fixed inset-0 z-50 bg-black/70", className)} {...props} />;
}

function DialogContent({ className, children, showCloseButton = true, ...props }: Omit<React.ComponentProps<typeof HeroModal.Container>, "children"> & { children?: React.ReactNode; showCloseButton?: boolean }) {
  return (
    <HeroModal.Backdrop>
      <HeroModal.Container placement="center" size="md" className={cn("z-50 w-full max-w-[calc(100%-2rem)] outline-none", className)} {...props}>
        <HeroModal.Dialog className="relative grid w-full gap-4 rounded-xl border border-line bg-card p-4 text-xs/relaxed text-foreground shadow-none outline-none">
          {children}
          {showCloseButton ? <HeroModal.CloseTrigger aria-label="Close dialog" className="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"><X size={14} /><span className="sr-only">Close</span></HeroModal.CloseTrigger> : null}
        </HeroModal.Dialog>
      </HeroModal.Container>
    </HeroModal.Backdrop>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<typeof HeroModal.Header>) {
  return <HeroModal.Header data-slot="dialog-header" className={cn("flex flex-col gap-1", className)} {...props} />;
}

function DialogFooter({ className, showCloseButton = false, children, ...props }: React.ComponentProps<typeof HeroModal.Footer> & { showCloseButton?: boolean }) {
  return <HeroModal.Footer data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props}>{children}{showCloseButton ? <HeroModal.CloseTrigger>Close</HeroModal.CloseTrigger> : null}</HeroModal.Footer>;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof HeroModal.Heading>) {
  return <HeroModal.Heading data-slot="dialog-title" className={cn("text-sm font-medium", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="dialog-description" className={cn("text-xs/relaxed text-muted-foreground", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
