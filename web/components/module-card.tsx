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
 * Shared module shell: borderless surface with the Rift card shadow,
 * 13px semibold title, muted 12px drill-in link — or a bare flat section.
 */
export function ModuleCard({ title, linkLabel, href = "#", children, className, bare = false }: ModuleCardProps) {
  const head = (
    <div className="mb-3 flex items-start justify-between gap-2">
      <h2 className="m-0 text-[13px] font-semibold text-foreground">{title}</h2>
      {linkLabel ? (
        <a
          href={href}
          className="flex shrink-0 items-center gap-0.5 rounded text-[12px] text-faint transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
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
        "gap-0 p-4", 
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
    tone === "green" ? "bg-success-vivid" : tone === "red" ? "bg-danger-vivid" : "bg-primary";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
    >
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
