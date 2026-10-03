"use client";

import { cn } from "cn";
import { HugeiconsIcon } from "@hugeicons/react";
import { ClockIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { CheckCircleIcon, FileIcon, WalletIcon } from "@/components/icons";

/**
 * The one banner treatment, used by every banner in the product: the to-review
 * prompt, the trial/upgrade prompt, and anything added later.
 *
 * The surface is a light tint of the brand colour — `--accent-100` in light,
 * its dark-aware equivalent in dark — rather than a raw brand wash, so it reads
 * as a prompt sitting on the page instead of a slab of colour. The icon is
 * chosen per banner from `tone`, so the mark always matches what the banner is
 * asking for.
 */
export type BannerTone = "review" | "upgrade" | "info" | "done" | "wallet";

const TONE: Record<BannerTone, { icon: (props: { className?: string }) => React.ReactNode; surface: string; mark: string }> = {
  // Lighter version of the brand colour: the accent tint, which is derived
  // light- or dark-aware and already follows the chosen accent.
  review: { icon: (p: { className?: string }) => <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} size={16} className={p.className}  />, surface: "border-accent-600/20 bg-accent-soft", mark: "bg-accent-100 text-accent-600" },
  upgrade: { icon: (p: { className?: string }) => <HugeiconsIcon icon={ClockIcon} strokeWidth={2} size={16} className={p.className}  />, surface: "border-accent-600/20 bg-accent-soft", mark: "bg-accent-100 text-accent-600" },
  info: { icon: FileIcon, surface: "border-accent-600/20 bg-accent-soft", mark: "bg-accent-100 text-accent-600" },
  done: { icon: CheckCircleIcon, surface: "border-success/30 bg-success-soft", mark: "bg-success-soft text-success" },
  wallet: { icon: WalletIcon, surface: "border-accent-600/20 bg-accent-soft", mark: "bg-accent-100 text-accent-600" },
};

export interface BannerProps {
  tone: BannerTone;
  title: React.ReactNode;
  /** Count chip beside the title. Omit when there is nothing to count. */
  count?: number;
  description?: React.ReactNode;
  /** Buttons on the trailing edge. */
  actions?: React.ReactNode;
  className?: string;
}

export function Banner({ tone, title, count, description, actions, className }: BannerProps) {
  const { icon: Icon, surface, mark } = TONE[tone];
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-md border px-4 py-3", surface, className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", mark)} aria-hidden="true">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-foreground">
            {title}
            {typeof count === "number" && count > 0 ? (
              <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent-600">
                {count}
              </span>
            ) : null}
          </p>
          {description ? <p className="m-0 mt-0.5 text-[12px] leading-5 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
