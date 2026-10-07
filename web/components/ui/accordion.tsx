"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import type React from "react";
import { cn } from "@/lib/utils";

export function Accordion(
  props: AccordionPrimitive.Root.Props,
): React.ReactElement {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

export function AccordionItem({
  className,
  ...props
}: AccordionPrimitive.Item.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Item
      className={cn(className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "flex flex-1 cursor-pointer items-center justify-between gap-4 rounded-[4px] py-4 text-left font-medium text-sm outline-none transition-all disabled:pointer-events-none disabled:opacity-64",
          className,
        )}
        data-slot="accordion-trigger"
        {...props}
      >
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionPanel({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Panel
      className="h-(--accordion-panel-height) overflow-hidden text-muted-foreground text-sm transition-[height] duration-200 ease-in-out data-ending-style:h-0 data-starting-style:h-0"
      data-slot="accordion-panel"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export { AccordionPrimitive, AccordionPanel as AccordionContent };
