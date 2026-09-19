import type { ReactNode } from "react";
import { cn } from "cn";
import { Card } from "./ui/card";
import { CaretDownIcon } from "./icons";

interface ModuleCardProps {
  title: string;
  linkLabel?: string;
  href?: string;
  children: ReactNode;
  className?: string;
  /** Flat section: title + content, no card chrome. */
  bare?: boolean;
}

/**
 * Shared module shell: borderless white card with soft separation shadow,
 * 13px semibold title, muted 12px drill-in link — or a bare flat section.
 */
export function ModuleCard({ title, linkLabel, href = "#", children, className, bare = false }: ModuleCardProps) {
  const head = (
    <div className="mb-3 flex items-start justify-between gap-2">
      <h2 className="m-0 text-[13px] font-semibold text-[#1c1d20] dark:text-[#eceef0]">{title}</h2>
      {linkLabel ? (
        <a
          href={href}
          className="flex shrink-0 items-center gap-0.5 rounded text-[12px] text-[#8a8b91] dark:text-[#a2a3a8] transition-colors outline-none hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9] focus-visible:outline-offset-2"
        >
          {linkLabel}
          <span aria-hidden="true" className="inline-flex -rotate-90">
            <CaretDownIcon />
          </span>
        </a>
      ) : null}
    </div>
  );
  if (bare) {
    return (
      <section className={className}>
        {head}
        {children}
      </section>
    );
  }
  return (
    <Card
      className={cn(
        "gap-0 rounded-[10px] border-0 bg-white dark:bg-[#161617] p-4 shadow-[0_1px_2px_rgba(23,24,28,0.05),0_4px_16px_rgba(23,24,28,0.06)] ring-0",
        className
      )}
    >
      {head}
      {children}
    </Card>
  );
}

export function Meter({ value, tone }: { value: number; tone: "green" | "red" | "accent" }) {
  const color =
    tone === "green" ? "bg-[#22C55E]" : tone === "red" ? "bg-[#F04438]" : "bg-[#4a55c9]";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-[#f1efeb] dark:bg-[#26262a]"
    >
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
