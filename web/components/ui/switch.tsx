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
      isSelected={Boolean(checked)}
      onChange={onCheckedChange}
      size={size === "sm" ? "sm" : "md"}
      className={cn("group/switch inline-flex shrink-0 items-center outline-none", className)}
      {...props}
    >
      <HeroSwitch.Content className="relative inline-flex !h-7 !w-12 items-center rounded-full bg-[#d9dce0] outline-none transition-colors duration-150 data-[selected=true]:bg-primary group-data-[selected=true]/switch:bg-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-disabled:cursor-not-allowed data-disabled:opacity-50">
        <HeroSwitch.Control className="absolute inset-0 !h-full !w-full rounded-full !bg-transparent !p-0 outline-none">
          <HeroSwitch.Thumb className="!m-0 block !size-6 shrink-0 translate-x-0.5 rounded-full !bg-white shadow-[0_1px_3px_rgb(23_24_28/0.08)] transition-transform duration-150 group-data-[selected=true]/switch:translate-x-[22px]" />
        </HeroSwitch.Control>
      </HeroSwitch.Content>
    </HeroSwitch.Root>
  );
}

export { Switch };
