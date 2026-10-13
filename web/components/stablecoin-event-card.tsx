"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/format";
import { useApi } from "@/hooks/use-api";

/**
 * One detected stablecoin movement, with the answer it needs.
 *
 * Three answers, not two. Confirm and dismiss are obvious; "not sure" is the
 * one people actually give when they look and cannot tell, and it is worth
 * having as its own button rather than making them guess. It resolves nothing —
 * the suggestion stays open and simply stops asking for a fortnight.
 *
 * The wording comes from the server in `reason`. Recomputing "250 USDC left
 * your wallet and N377,500 arrived" in the browser would be a second
 * implementation of the same arithmetic, and two implementations of a tax
 * figure eventually disagree with each other.
 *
 * Nothing here files, pays or moves money. Confirming records what the user
 * said and links the ledger rows it belongs to.
 */

export type StablecoinSuggestion = {
  id: string;
  kind: "CASH_OUT" | "ON_RAMP" | "YIELD_RECEIVED" | "YIELD_REDEMPTION_GAIN";
  token: string;
  tokenAmount: string;
  usdValue: string | null;
  nairaAmount: string | null;
  matchConfidence: string;
  reason: string | null;
};

const KIND_TITLE: Record<StablecoinSuggestion["kind"], string> = {
  CASH_OUT: "Cash-out detected",
  ON_RAMP: "Purchase detected",
  YIELD_RECEIVED: "Possible stablecoin yield",
  YIELD_REDEMPTION_GAIN: "Gain on redeeming",
};

const asNumber = (value: string | null) => (value === null ? null : Number(value));

export function StablecoinEventCard({ event, onAnswered }: { event: StablecoinSuggestion; onAnswered?: () => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);

  const confidence = asNumber(event.matchConfidence);
  const usd = asNumber(event.usdValue);
  const naira = asNumber(event.nairaAmount);

  const answer = async (action: "confirm" | "dismiss" | "defer") => {
    setBusy(true);
    try {
      if (action === "confirm") {
        await api.post(`/v1/stablecoin-events/${event.id}/confirm`, {
          remember,
          ...(remember ? { token: event.token } : {}),
        });
        toast.success("Recorded. Both legs now count as transfers, not income or spending.");
      } else if (action === "dismiss") {
        await api.post(`/v1/stablecoin-events/${event.id}/dismiss`, {});
      } else {
        await api.post(`/v1/stablecoin-events/${event.id}/defer`, {});
      }
      onAnswered?.();
    } catch {
      toast.error("Could not save that answer. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-background p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-[13px] font-semibold">{KIND_TITLE[event.kind]}</h3>
        {confidence !== null ? (
          <span className="text-[11px] font-medium text-muted-foreground">{Math.round(confidence * 100)}% match</span>
        ) : null}
      </div>

      <p className="m-0 mt-1.5 text-[13px] leading-relaxed">
        {event.reason ?? `${event.tokenAmount} ${event.token}`}
      </p>

      {(usd !== null || naira !== null) && event.reason === null ? (
        <p className="mono m-0 mt-1 text-[12px] tabular-nums text-muted-foreground">
          {usd !== null ? formatCurrency(usd, "USD") : null}
          {usd !== null && naira !== null ? " · " : null}
          {naira !== null ? formatCurrency(naira, "NGN") : null}
        </p>
      ) : null}

      {event.kind === "CASH_OUT" || event.kind === "ON_RAMP" ? (
        <label className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Checkbox checked={remember} onCheckedChange={(next) => setRemember(next === true)} />
          Remember this sender as an {event.kind === "CASH_OUT" ? "offramp" : "onramp"}
        </label>
      ) : null}

      <p className="m-0 mt-3 text-[11px] leading-relaxed text-muted-foreground">
        An estimate, not advice. Dobby does not file, pay or move money. Check your provider&apos;s receipt before you rely on
        this.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="small" disabled={busy} onClick={() => void answer("confirm")}>
          Yes, that&apos;s right
        </Button>
        <Button variant="secondary" size="small" disabled={busy} onClick={() => void answer("dismiss")}>
          No
        </Button>
        <Button variant="ghost" size="small" disabled={busy} onClick={() => void answer("defer")}>
          Not sure
        </Button>
      </div>
    </div>
  );
}

/**
 * Bulk-confirms the high-confidence suggestions.
 *
 * The floor is enforced server-side as well as here: a narration-only guess is
 * the kind of thing a person should look at, and one tap should never commit
 * several of them at once.
 */
export function StablecoinBulkConfirm({ ids, onAnswered }: { ids: string[]; onAnswered?: () => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  if (ids.length === 0) return null;

  const confirmAll = async () => {
    setBusy(true);
    try {
      const response = await api.post<{ data: { confirmed: number; skipped: number } }>("/v1/stablecoin-events/confirm-many", { ids });
      const { confirmed, skipped } = response.data;
      toast.success(
        skipped > 0
          ? `Confirmed ${confirmed}. ${skipped} needed a look of their own.`
          : `Confirmed ${confirmed} suggestion${confirmed === 1 ? "" : "s"}.`,
      );
      onAnswered?.();
    } catch {
      toast.error("Could not confirm those. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" size="small" disabled={busy} onClick={() => void confirmAll()}>
      {busy ? "Confirming…" : `Confirm ${ids.length} confident`}
    </Button>
  );
}