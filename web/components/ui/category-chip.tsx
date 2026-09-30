"use client";

import { cn } from "cn";
import { categoryMeta } from "@/lib/transactions";

export interface CategoryChipProps {
  /** Category id — built-in ids keep their assigned colour. */
  id: string;
  /** Display name, used for custom categories. */
  name?: string;
  /** Colour the user assigned to the category, when set. */
  color?: string | null;
  className?: string;
}

/**
 * Category pill. The background comes from `meta.hex` as an inline style
 * rather than a Tailwind class, so a colour chosen in Settings shows up
 * without generating classes at runtime. The emoji keeps the chip readable
 * when several categories sit close together.
 */
export function CategoryChip({ id, name, color, className }: CategoryChipProps) {
  const meta = categoryMeta(id, name, color);
  return (
    <span
      style={{ backgroundColor: meta.hex }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap text-white",
        className,
      )}
    >
      <span aria-hidden="true" className="text-[11px]">{meta.emoji}</span>
      {meta.label}
    </span>
  );
}
