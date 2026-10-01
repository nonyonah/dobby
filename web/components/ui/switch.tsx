"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";

function Switch({
  className,
  checked,
  onCheckedChange,
  size: _size = "default",
  ...props
}: Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "checked" | "onCheckedChange" | "size"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "default";
}) {
  void _size;
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn("group/switch inline-flex shrink-0 items-center outline-none", className)}
      {...props}
    >
      <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-muted outline-none transition-colors duration-150 group-data-checked/switch:bg-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-disabled:cursor-not-allowed data-disabled:opacity-50">
        <SwitchPrimitive.Thumb className="m-0 block size-4 shrink-0 translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgb(23_24_28/0.08)] transition-transform duration-150 group-data-checked/switch:translate-x-[18px]" />
      </span>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
