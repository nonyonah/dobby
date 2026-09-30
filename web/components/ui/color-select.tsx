"use client";

import { cn } from "cn";
import { NAMED_COLORS, colorName } from "@/lib/colors";

/**
 * Colour choice as a real `<select>` of colour names, with a dot showing the
 * current colour inside the control. A native select cannot render an image in
 * its options, so the dot is a positioned sibling and the text is padded to
 * clear it — the picker stays a plain `<select>` and never needs a portal,
 * focus trap, or outside-click handling.
 */

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a8b91' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")";

export interface ColorSelectProps {
  /** Selected hex, or null/undefined to let the app pick. */
  value: string | null | undefined;
  /** `""` means "let the app choose" (Automatic). */
  onChange: (hex: string) => void;
  label: string;
  className?: string;
  /** Override the option list; defaults to the shared named palette. */
  options?: Array<{ value: string; label: string }>;
  /** Hide the leading "Automatic" option (for pickers that always have a value). */
  hideAuto?: boolean;
}

export function ColorSelect({ value, onChange, label, className, options: optionsProp, hideAuto }: ColorSelectProps) {
  const selected = (value ?? "").toLowerCase();
  // The chosen colour may be one of ours or a custom value from the old model;
  // always keep the current colour as an option so the select never goes blank.
  const options = optionsProp ?? NAMED_COLORS.map((c) => ({ value: c.hex, label: c.name }));
  if (selected && !options.some((o) => o.value === selected)) {
    options.unshift({ value: selected, label: colorName(value) });
  }

  return (
    <div className={cn("min-w-0", className)}>
      <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 rounded-full ring-1 ring-inset ring-foreground/15"
          style={{ background: value ?? "var(--muted)" }}
        />
        <select
          aria-label={label}
          value={selected}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full cursor-pointer appearance-none rounded-[50px] border border-line bg-card py-0 pr-8 pl-9 text-[13px] text-foreground shadow-[0_0_0_0.5px_rgb(0_0_0/0.09),0_3px_6px_-2px_rgb(0_0_0/0.02),0_1px_1px_rgb(0_0_0/0.04)] outline-none transition-shadow duration-150 ease-out focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 bg-[length:16px] bg-[right_0.5rem_center] bg-no-repeat dark:border-[#2d2d31] dark:bg-[#232327] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
          style={{ backgroundImage: CHEVRON }}
        >
          {hideAuto ? null : <option value="">Automatic</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
