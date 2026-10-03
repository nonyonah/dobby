"use client";

import * as React from "react";
import { cn } from "cn";

/**
 * The app's value picker: a real `<select>`.
 *
 * Every option list in Dobby (country, currency, theme, tax status, source,
 * document type, month filter, category, chain, budget type, …) is a plain list
 * of text values, so it uses the native control. That is deliberate:
 *  - it can never "force quit" — there is no portal, no outside-click handling,
 *    and no focus trap to escape, so it behaves identically inside a modal;
 *  - the OS renders the option list, so flag emoji and capitalisation are shown
 *    exactly as written and need no JS;
 *  - it is keyboard and screen-reader correct for free.
 *
 * Reach for `DropdownMenu` only for *action* menus (colour pickers, export,
 * per-row actions) — those need a grid or a list of buttons, which a `<select>`
 * cannot express. See the skill notes on the two families.
 *
 * The `value`/`onValueChange` signature matches the old shadcn-style `Select` so
 * call sites read the same.
 */

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a8b91' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")";

export const selectControlClass =
  "h-8 w-full rounded-md border border-line bg-card px-2.5 pr-8 text-[13px] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)] outline-none transition-shadow duration-150 ease-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08)]";

export interface NativeSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface NativeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: NativeSelectOption[];
  id?: string;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
}

export function NativeSelect({ value, onValueChange, options, id, className, disabled, ...rest }: NativeSelectProps) {
  return (
    <div className={cn("w-full", className)}>
      <select
        id={id}
        aria-label={rest["aria-label"]}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
        className={selectControlClass}
        style={{ backgroundImage: CHEVRON }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
