"use client";

import * as React from "react";
import { Switch as HeroSwitch } from "@heroui/react";
import { cn } from "cn";

function Switch({
  className,
  checked,
  onCheckedChange,
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof HeroSwitch.Root>, "isSelected" | "onChange" | "size"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "default";
}) {
  return (
    <HeroSwitch.Root
      data-slot="switch"
      isSelected={checked}
      onChange={onCheckedChange}
      size={size === "sm" ? "sm" : "md"}
      className={cn("group/switch inline-flex shrink-0 items-center outline-none", className)}
      {...props}
    >
      <HeroSwitch.Content className="relative inline-flex h-5 w-9 items-center rounded-full bg-input outline-none transition-colors group-data-[selected=true]/switch:bg-primary focus-visible:ring-2 focus-visible:ring-ring/30 data-[disabled]:opacity-50">
        <HeroSwitch.Control className="absolute inset-0 rounded-full outline-none">
          <HeroSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-background shadow-none transition-transform group-data-[selected=true]/switch:translate-x-[18px]" />
        </HeroSwitch.Control>
      </HeroSwitch.Content>
    </HeroSwitch.Root>
  );
}

export { Switch };
