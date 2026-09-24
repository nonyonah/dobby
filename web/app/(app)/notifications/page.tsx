"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertIcon, CaretDownIcon, CheckIcon, CloseSmallIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useAttention, type AttentionItem } from "@/hooks/use-attention";

type KindFilter = "all" | AttentionItem["kind"];

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  review: "Review",
  tax: "Tax",
};

export default function NotificationsPage() {
  const { items, dismiss, dismissAll } = useAttention();
  const [kind, setKind] = useState<KindFilter>("all");
  const visible = kind === "all" ? items : items.filter((item) => item.kind === kind);

  return (
    <div className="w-full px-6 pt-6 pb-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-full bg-[#f1efeb] dark:bg-[#26262a] p-0.5" role="group" aria-label="Filter by type">
          {(["all", "review", "tax"] as KindFilter[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`h-[26px] cursor-pointer rounded-full px-3 text-[12px] font-medium capitalize transition-colors outline-none focus-visible:outline-2 focus-visible:outline-[#4a55c9] ${
                kind === k ? "bg-white dark:bg-[#3a3a40] text-[#1c1d20] dark:text-white shadow-sm" : "text-[#8a8b91] dark:text-[#a2a3a8] hover:text-[#1c1d20] dark:hover:text-white"
              }`}
            >
              {k === "all" ? "All" : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {visible.length > 0 ? (
          <Button variant="ghost" size="small" onClick={dismissAll}>
            Dismiss all
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[10px] bg-white dark:bg-[#161617] px-4 py-10 text-center shadow-[0_1px_2px_rgba(23,24,28,0.05),0_4px_16px_rgba(23,24,28,0.06)]" role="status">
          <p className="m-0 text-[13px] font-medium">You’re all caught up</p>
          <p className="m-0 mt-1 text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">
            New review items and tax documents will appear here.
          </p>
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {visible.map((item) => (
            <li
              key={item.id}
              className="mb-2 flex items-center gap-3 rounded-[10px] bg-white dark:bg-[#161617] px-4 py-3 shadow-[0_1px_2px_rgba(23,24,28,0.05),0_4px_16px_rgba(23,24,28,0.06)]"
            >
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#f1efeb] dark:bg-[#26262a] text-[#55565c] dark:text-[#a2a3a8]">
                <AlertIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{item.title}</span>
                <span className="block truncate text-[12px] text-[#8a8b91] dark:text-[#a2a3a8]">{item.sub}</span>
              </span>
              <span className="hidden shrink-0 rounded-full border border-[#e0ddd7] dark:border-[#2d2d31] px-2 py-0.5 text-[11px] font-medium text-[#8a8b91] dark:text-[#a2a3a8] sm:inline">
                {KIND_LABEL[item.kind]}
              </span>
              <Link
                href={item.href}
                className="flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[12px] font-medium text-[#4a55c9] outline-none hover:underline focus-visible:outline-2 focus-visible:outline-[#4a55c9]"
              >
                <CheckIcon /> {item.action}
                <span aria-hidden="true" className="inline-flex -rotate-90">
                  <CaretDownIcon />
                </span>
              </Link>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={`Dismiss ${item.title}`}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#8a8b91] outline-none transition-colors hover:bg-[#f1efeb] dark:hover:bg-white/[0.06] hover:text-[#1c1d20] focus-visible:outline-2 focus-visible:outline-[#4a55c9]"
              >
                <CloseSmallIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 mt-4 text-[11px] leading-relaxed text-[#8a8b91] dark:text-[#a2a3a8]">
        Suggestions are advisory only. Dobby will never change a transaction without your approval.
      </p>
    </div>
  );
}
