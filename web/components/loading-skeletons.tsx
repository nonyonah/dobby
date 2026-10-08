import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared loading skeletons.
 *
 * Only for states that are actually *pending*. A resolved-empty list is an
 * EmptyState, not a skeleton — showing a shimmer and then swapping it for
 * "you're all caught up" reads as a failure rather than as an answer, and it
 * trains people to distrust the shimmer.
 *
 * The shimmer comes from coss's Skeleton (`animate-skeleton` on
 * `--animate-skeleton`), which is defined in `globals.css` alongside the other
 * coss tokens.
 */

/** Stat-card row: a label above a figure, laid out `cols` across. */
export function StatSkeleton({ cols = 4, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: cols }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A block standing in for a chart or visualisation. */
export function ChartSkeleton({ className, height = "h-[120px]" }: { className?: string; height?: string }) {
  return <Skeleton className={cn("w-full", height, className)} aria-hidden="true" />;
}

/**
 * Rows for a table that is still loading. `columns` decides how many cells per
 * row; the last one is wide to stand in for the description column.
 */
export function TableSkeletonRows({ rows = 5, columns = 3 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-line" aria-hidden="true">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-3 px-3 py-3">
          {Array.from({ length: columns }, (_, cellIndex) => (
            <Skeleton
              key={cellIndex}
              className={cn("h-3.5", cellIndex === columns - 1 ? "w-16 shrink-0 ml-auto" : "flex-1", cellIndex === 0 && "max-w-[45%]")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Vertical list standing in for cards or a queue. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-7 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A block of text standing in for prose (a narrative panel, a settings group). */
export function DetailSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-3", index === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

/**
 * Wrapper for a region that is still resolving. Announces itself to assistive
 * tech once, and keeps the shimmer out of the tab order.
 */
export function LoadingRegion({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}