"use client";

import Link from "next/link";
import { AlertIcon, CaretDownIcon, CheckIcon } from "@/components/icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertIcon as AlertGlyph, InformationCircleIcon, MoreVerticalIcon } from "@hugeicons/core-free-icons";


import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Segmented } from "@/components/ui/segmented";
import { useAttention, type AttentionItem } from "@/hooks/use-attention";
import { usePlan } from "@/components/plan-provider";
import { useUpgrade } from "@/components/upgrade";
import { deriveBillingNotice } from "@/lib/billing-notice";
import { Alert, AlertContent, AlertDescription, AlertIndicator, AlertTitle } from "@/components/ui/alert";


import { useMemo, useState } from "react";

type KindFilter = "all" | AttentionItem["kind"];

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  review: "Review",
  tax: "Tax",
};

export default function NotificationsPage() {
  const { items, dismiss, dismissAll, markRead, markAllRead, isRead, unreadCount } = useAttention();
  const [kind, setKind] = useState<KindFilter>("all");
  const { plan, trialEndsAt } = usePlan();
  const { openCheckout, busy: checkoutBusy } = useUpgrade();
  // Captured once per mount, matching Settings, so the notice cannot flip
  // mid-session as the clock moves.
  const [pageOpenedAt] = useState(() => Date.now());

  /**
   * A lapsing subscription leads this feed rather than living only in Settings:
   * an alert nobody sees is not a reminder. Deliberately derived from plan and
   * trial dates alone here, since this page does not fetch billing — the
   * cancelled-subscription case needs `/v1/billing` and stays in Settings.
   */
  const billingNotice = useMemo(
    () =>
      deriveBillingNotice({
        plan,
        trialEndsAt,
        now: pageOpenedAt,
        formatDate: (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }),
    [plan, trialEndsAt, pageOpenedAt],
  );
  const visible = kind === "all" ? items : items.filter((item) => item.kind === kind);
  const visibleUnread = visible.filter((item) => !isRead(item.id)).length;

  return (
    <div className="w-full px-6 pt-6 pb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Filter by type"
          value={kind}
          onValueChange={setKind}
          options={(["all", "review", "tax"] as KindFilter[]).map((k) => ({ value: k, label: k === "all" ? "All" : KIND_LABEL[k] }))}
        />
        {visible.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="small" disabled={visibleUnread === 0} onClick={markAllRead}>
              Mark all as read
            </Button>
            <Button variant="ghost" size="small" onClick={dismissAll}>
              Dismiss all
            </Button>
          </div>
        ) : null}
      </div>

      {billingNotice ? (
        <Alert status={billingNotice.status} className="mb-4">
          <AlertIndicator>{billingNotice.status === "danger" ? <HugeiconsIcon icon={AlertGlyph} strokeWidth={2}  /> : <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2}  />}</AlertIndicator>
          <AlertContent>
            <AlertTitle>{billingNotice.title}</AlertTitle>
            <AlertDescription>{billingNotice.body}</AlertDescription>
          </AlertContent>
          <div className="flex shrink-0 self-center">
            <Button variant="primary" size="small" disabled={checkoutBusy} onClick={() => openCheckout()}>
              {checkoutBusy ? "Opening checkout…" : "Upgrade to Pro"}
            </Button>
          </div>
        </Alert>
      ) : null}

      {visible.length === 0 ? (
        <div className="px-4 py-10 text-center" role="status">
          <p className="m-0 text-[13px] font-medium">You&apos;re all caught up</p>
          <p className="m-0 mt-1 text-[12px] text-muted-foreground">
            Review items and tax documents will appear here. Import a statement or connect your email
            and Dobby will queue anything ambiguous.
          </p>
        </div>
      ) : (
        /* Plain list on the page background — no card per row, so the list
           reads as one continuous feed with hairlines between entries. */
        <ul className="m-0 list-none divide-y divide-line p-0">
          {visible.map((item) => {
            const read = isRead(item.id);
            return (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden="true"
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                    read ? "bg-secondary text-muted-foreground" : "bg-warning-soft text-warning"
                  }`}
                >
                  <AlertIcon />
                </span>
                <span className="min-w-0 flex-1">
                  {/* Unread reads bold; reading it drops the weight, which is the
                      whole visual signal — no dot, no card. */}
                  <span suppressHydrationWarning className={`block truncate text-[13px] ${read ? "font-normal text-muted-foreground" : "font-semibold text-foreground"}`}>
                    {item.title}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">{item.sub}</span>
                </span>
                <span className="hidden shrink-0 text-[11px] font-medium text-muted-foreground sm:inline">
                  {KIND_LABEL[item.kind]}
                </span>
                {/* Items with no action (a locked attachment has nothing to
                    approve) render without a link rather than an empty one. */}
                {item.action && item.href ? (
                  <Link
                    href={item.href}
                    onClick={() => markRead(item.id)}
                    className="flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[12px] font-medium text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <CheckIcon /> {item.action}
                    <span aria-hidden="true" className="inline-flex -rotate-90">
                      <CaretDownIcon />
                    </span>
                  </Link>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Actions for ${item.title}`}
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} size={16} aria-hidden="true"  />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem disabled={read} onClick={() => markRead(item.id)}>
                      <CheckIcon className="size-3.5" />
                      <span className="flex-1">Mark as read</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => dismiss(item.id)} className="text-destructive focus:text-destructive">
                      <span className="flex-1">Dismiss</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <p className="m-0 mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Suggestions are advisory only. Dobby will never change a transaction without your approval.
      </p>
    </div>
  );
}
