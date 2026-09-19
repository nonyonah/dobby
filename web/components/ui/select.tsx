"use client";

import * as React from "react";
import { ListBox, Select as HeroSelect } from "@heroui/react";
import { cn } from "cn";

/**
 * Compatibility surface for the app's existing Select API. The implementation
 * is HeroUI's native collection-based Select/ListBox, so callers can migrate
 * incrementally without bringing Base UI back into the bundle.
 */
type SelectProps = {
  value?: string | null;
  defaultValue?: string;
  onValueChange?: (value: string | null) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

type SelectItemProps = {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
};

function SelectItem(_props: SelectItemProps) {
  return null;
}

function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function SelectTrigger({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "default" }) {
  return <HeroSelect.Trigger className={cn("h-8 min-w-32 rounded-lg border border-line bg-card px-2.5 text-[13px] text-foreground", className)} {...(props as any)}>{children}</HeroSelect.Trigger>;
}

function SelectValue({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <HeroSelect.Value className={cn("truncate text-left", className)}>{children}</HeroSelect.Value>;
}

function collectItems(children: React.ReactNode): SelectItemProps[] {
  const items: SelectItemProps[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === SelectItem) {
      items.push(child.props as SelectItemProps);
      return;
    }
    const childProps = child.props as { children?: React.ReactNode };
    if (childProps.children) items.push(...collectItems(childProps.children));
  });
  return items;
}

function Select({ value, defaultValue, onValueChange, children, className, disabled }: SelectProps) {
  const trigger = React.Children.toArray(children).find((child) => React.isValidElement(child) && child.type === SelectTrigger) as React.ReactElement<React.ComponentProps<typeof SelectTrigger>> | undefined;
  const content = React.Children.toArray(children).find((child) => React.isValidElement(child) && child.type === SelectContent) as React.ReactElement<{ children?: React.ReactNode }> | undefined;
  const items = collectItems(content?.props.children);
  const triggerProps = trigger?.props ?? {};
  const triggerClassName = triggerProps.className;

  return (
    <HeroSelect
      variant="primary"
      className={cn("w-full", className)}
      selectedKey={value ?? undefined}
      defaultSelectedKey={defaultValue}
      isDisabled={disabled}
      onSelectionChange={(key) => onValueChange?.(key === "all" ? null : String(key))}
    >
      <HeroSelect.Trigger
        id={triggerProps.id}
        aria-label={triggerProps["aria-label"]}
        className={cn("h-8 min-w-32 rounded-lg border border-line bg-card px-2.5 text-[13px] text-foreground", triggerClassName)}
      >
        <HeroSelect.Value />
      </HeroSelect.Trigger>
      <HeroSelect.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.value} id={item.value} textValue={typeof item.children === "string" ? item.children : item.value} isDisabled={item.disabled}>
              {item.children}
            </ListBox.Item>
          ))}
        </ListBox>
      </HeroSelect.Popover>
    </HeroSelect>
  );
}

function SelectGroup({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function SelectLabel({ children }: { children: React.ReactNode }) { return <div className="px-2 py-1 text-xs text-muted-foreground">{children}</div>; }
function SelectSeparator() { return <div className="my-1 h-px bg-line" />; }

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue };
