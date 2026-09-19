"use client";

import * as React from "react";
import { Popover as HeroPopover } from "@heroui/react";
import { cn } from "cn";

type PopoverProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

function Popover({ open, defaultOpen, onOpenChange, children }: PopoverProps) {
  return <HeroPopover isOpen={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>{children}</HeroPopover>;
}

function PopoverTrigger({ render, children, className, ...props }: { render?: React.ReactElement; children?: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <HeroPopover.Trigger className={className} {...props}>{render ?? children}</HeroPopover.Trigger>;
}

function PopoverContent({ className, align = "center", sideOffset = 4, children, ...props }: { className?: string; align?: "start" | "center" | "end"; side?: string; sideOffset?: number; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const placement = align === "start" ? "bottom start" : align === "end" ? "bottom end" : "bottom";
  return <HeroPopover.Content placement={placement as "bottom"} offset={sideOffset} className={cn("z-50 flex w-72 flex-col gap-4 rounded-xl border border-line bg-card p-2.5 text-xs text-popover-foreground shadow-sm outline-none", className)} {...props}>{children}</HeroPopover.Content>;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="popover-header" className={cn("flex flex-col gap-1 text-xs", className)} {...props} />; }
function PopoverTitle({ className, ...props }: React.ComponentProps<"h3">) { return <h3 data-slot="popover-title" className={cn("text-sm font-medium", className)} {...props} />; }
function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) { return <p data-slot="popover-description" className={cn("text-muted-foreground", className)} {...props} />; }

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
