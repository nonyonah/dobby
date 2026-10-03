"use client";

import { cn } from "cn";

/**
 * Segmented control — a row of mutually exclusive options where the selected
 * one is marked by a pill.
 *
 * There is deliberately no container: the group sits straight on the page
 * background, and only the selected segment has a surface. The pill uses
 * `--sidebar-accent`, the same token the sidebar's active row uses, so the two
 * read as the same selection language and land on the same colour in dark mode
 * without a second value to keep in sync.
 *
 * All segments are the same height, so the row never shifts as the selection
 * changes.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Optional trailing count, e.g. an unread badge. */
  count?: number;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Transaction views". */
  label: string;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onValueChange, label, className }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex items-center gap-1", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium whitespace-nowrap outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
              selected
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
              option.disabled && "pointer-events-none opacity-50",
            )}
          >
            {option.label}
            {typeof option.count === "number" ? (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 py-px text-[11px] tabular-nums",
                  selected ? "text-sidebar-accent-foreground" : "text-muted-foreground",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
