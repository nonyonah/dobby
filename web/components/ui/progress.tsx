"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type React from "react";
import { cn } from "cn";

/**
 * Progress bar, installed from the coss registry (`@coss/progress`) by writing
 * the shipped file by hand.
 *
 * Fetched from the registry rather than run through `shadcn add @coss/progress`:
 * that CLI rewrites `dependencies` and clobbers unrelated files, and this
 * project's `Button` must stay ours (29 call sites use `variant="primary"`,
 * which coss's button does not have). The only change from the shipped source is
 * the `cn` import path, which the registry writes for its own tree.
 *
 * Motion note: the indicator animates its inline width, which is why the class
 * names the exact property rather than using a bare `transition`.
 */
export function Progress({
  className,
  children,
  ...props
}: ProgressPrimitive.Root.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Root
      className={cn("flex w-full flex-col gap-2", className)}
      data-slot="progress"
      {...props}
    >
      {children ? (
        children
      ) : (
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      )}
    </ProgressPrimitive.Root>
  );
}

export function ProgressLabel({
  className,
  ...props
}: ProgressPrimitive.Label.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Label
      className={cn("font-medium text-sm", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

export function ProgressTrack({
  className,
  ...props
}: ProgressPrimitive.Track.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Track
      className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-input", className)}
      data-slot="progress-track"
      {...props}
    />
  );
}

export function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Indicator
      className={cn("bg-primary transition-[width] duration-500", className)}
      data-slot="progress-indicator"
      {...props}
    />
  );
}

export function ProgressValue({
  className,
  ...props
}: ProgressPrimitive.Value.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Value
      className={cn("text-sm tabular-nums", className)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export { ProgressPrimitive };