/**
 * Trial length, for copy.
 *
 * The API owns the real number (`TRIAL_DAYS` in `api/src/lib/entitlement.ts`)
 * and sends it through `/v1/me`; `PlanProvider` hands it here. Marketing and
 * signed-out surfaces read the fallback instead, which is why the fallback
 * exists rather than the constant being inlined at each call site.
 *
 * The reason it is not simply a `const`: the marketing page and the API would
 * then hold two numbers, and the day one changed the copy would be the thing
 * still saying fourteen.
 */

let days = 7;

export function setTrialDays(value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    days = Math.round(value);
  }
}

export function trialDays(): number {
  return days;
}

/** "7-day" — for building a phrase rather than printing the number alone. */
export function trialLength(): string {
  return `${days}-day`;
}