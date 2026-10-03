"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";

type PopoverProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

function Popover({ open, defaultOpen, onOpenChange, children }: PopoverProps) {
  return <PopoverPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>{children}</PopoverPrimitive.Root>;
}

function PopoverTrigger({ render, children, className, ...props }: { render?: React.ReactElement; children?: React.ReactNode; className?: string } & Omit<React.ComponentProps<typeof PopoverPrimitive.Trigger>, "render" | "children" | "className">) {
  if (render) return <PopoverPrimitive.Trigger render={render} className={className} {...props} />;
  return <PopoverPrimitive.Trigger className={className} {...props}>{children}</PopoverPrimitive.Trigger>;
}

function PopoverContent({ className, align = "center", side = "bottom", sideOffset = 4, children, ...props }: { className?: string; align?: "start" | "center" | "end"; side?: "top" | "bottom" | "left" | "right"; sideOffset?: number; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} side={side} sideOffset={sideOffset} className="z-50 outline-none">
        <PopoverPrimitive.Popup className={cn("z-50 flex max-h-[calc(100dvh-3rem)] w-72 flex-col gap-4 overflow-y-auto rounded-lg border border-line bg-card p-2.5 text-xs text-popover-foreground shadow-sm outline-none", className)} {...props}>{children}</PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="popover-header" className={cn("flex flex-col gap-1 text-xs", className)} {...props} />; }
function PopoverTitle({ className, ...props }: React.ComponentProps<"h3">) { return <h3 data-slot="popover-title" className={cn("text-sm font-medium", className)} {...props} />; }
function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) { return <p data-slot="popover-description" className={cn("text-muted-foreground", className)} {...props} />; }

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
