import type React from "react";
import { cn } from "@/lib/utils";

/**
 * Chrome for a coss `Table` that reproduces the surface HeroUI drew around a
 * `variant="primary"` table: `--surface-secondary` fill, `--spacing` inline and
 * bottom padding, and `min(32px, calc(var(--radius) * 2.5))` corners.
 *
 * Local on purpose — coss ships no equivalent, and the surrounding surface has
 * to stay identical to what the HeroUI tables looked like.
 */
export function TableShell({
  className,
  children,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-[calc(var(--radius)*2.5)] bg-[var(--surface-secondary)] px-(--spacing) pb-(--spacing)",
        className,
      )}
      data-slot="table-shell"
      {...props}
    >
      {children}
    </div>
  );
}
