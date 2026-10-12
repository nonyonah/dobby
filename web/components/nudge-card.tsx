"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";

type Nudge = {
  key: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

/**
 * The in-app nudge: one card, at the top of the dashboard, dismissible.
 *
 * The server decides whether anything shows — the same rules and the same
 * priority order as the email path, so the card on screen is the card that
 * would have been sent. This component only draws it and reports what happened
 * to it; a nudge that shows up here and disagrees with the engine would mean
 * two sources of truth again.
 *
 * Dismissing is a fourteen-day hide, not a local flag, so it survives a reload
 * and follows the person to another device.
 */
export function NudgeCard() {
  const api = useApi();
  const [nudge, setNudge] = useState<Nudge | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get<{ data: { nudge: Nudge | null } }>("/v1/nudges");
      setNudge(response.data.nudge);
    } catch {
      // A nudge is never worth an error message.
      setNudge(null);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const complete = async () => {
    if (!nudge) return;
    // Marked complete on the way to the destination, so the click is recorded
    // even if the navigation happens first.
    void api.post(`/v1/nudges/${nudge.key}/complete`, {}).catch(() => undefined);
    setNudge(null);
  };

  const dismiss = async () => {
    if (!nudge) return;
    setNudge(null);
    try {
      await api.post(`/v1/nudges/${nudge.key}/dismiss`, {});
    } catch {
      // Still hidden for this session; the server state catches up next load.
    }
  };

  if (!nudge) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-[10px] border border-line bg-card px-3.5 py-3">
      <HugeiconsIcon
        icon={SparklesIcon}
        size={16}
        className="mt-0.5 shrink-0 text-primary"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] font-medium text-foreground">{nudge.headline}</p>
        <p className="m-0 mt-0.5 text-[12px] leading-5 text-muted-foreground">{nudge.body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link href={nudge.ctaHref} onClick={complete}>
          <Button variant="primary" size="small" tabIndex={-1} aria-hidden="true">
            {nudge.ctaLabel}
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="small"
          onClick={() => void dismiss()}
          className="text-muted-foreground"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
