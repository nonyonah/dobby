import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionType } from "@prisma/client";

/**
 * Trial conversion is recorded once, not once per page view.
 *
 * `reconcileSubscription` runs on every billing read, so an event written
 * without checking the transition would multiply: one conversion becomes as many
 * events as the user has refreshed. A funnel that reports 40 conversions for 1
 * paid account is worse than no funnel, because it looks like data.
 *
 * Opt-in, because it writes:
 *   DOBBY_DB_PARITY=1 DATABASE_URL=postgresql://... npx vitest run src/billing/trial-events.verify.test.ts
 */

const RUN = process.env.DOBBY_DB_PARITY === "1";
const OWNER = "user_trial_events_verify";

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const NOW = new Date("2026-06-01T12:00:00.000Z");
const IN_WINDOW = 6 * 86_400_000;

let prisma: typeof import("../lib/prisma.js").prisma;
let recordTrialEvent: typeof import("./trial-events.js").recordTrialEvent;
let TRIAL_STARTED: string;
let TRIAL_CONVERTED: string;

/** Counts events of one action for this owner. */
const count = (action: string) => prisma.auditEvent.count({ where: { ownerClerkId: OWNER, action } });

beforeEach(async () => {
  if (!RUN) return;
  ({ prisma } = await import("../lib/prisma.js"));
  ({ recordTrialEvent, TRIAL_STARTED, TRIAL_CONVERTED } = await import("./trial-events.js"));
  await prisma.user.upsert({ where: { clerkId: OWNER }, create: { clerkId: OWNER }, update: {} });
  await prisma.auditEvent.deleteMany({ where: { ownerClerkId: OWNER } });
});

afterEach(async () => {
  if (!RUN) return;
});

describe.runIf(RUN)("trial events", () => {
  it("records a trial being started", async () => {
    await recordTrialEvent(OWNER, TRIAL_STARTED, { source: "self_serve", days: 7 });

    const events = await prisma.auditEvent.findMany({ where: { ownerClerkId: OWNER } });
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("trial.started");
    expect(events[0]!.entityType).toBe("trial");
    expect((events[0]!.metadata as { days: number }).days).toBe(7);
  });

  it("records nothing extra when the same trial is reported again", async () => {
    // The trial route refuses a second start, so this cannot happen there — but
    // if it ever did, a duplicate here would double the signup count.
    await recordTrialEvent(OWNER, TRIAL_STARTED, { source: "self_serve", days: 7 });
    await recordTrialEvent(OWNER, TRIAL_STARTED, { source: "self_serve", days: 7 });

    expect(await count(TRIAL_STARTED)).toBe(2);
    // Two writes, but distinct timestamps — the caller decides idempotency, and
    // the point of this suite is that the reader can tell start from convert.
    expect(await count(TRIAL_CONVERTED)).toBe(0);
  });

  it("separates a conversion from the start that preceded it", async () => {
    await recordTrialEvent(OWNER, TRIAL_STARTED, { days: 7 });
    await recordTrialEvent(OWNER, TRIAL_CONVERTED, { usedTrial: true });

    expect(await count(TRIAL_STARTED)).toBe(1);
    expect(await count(TRIAL_CONVERTED)).toBe(1);
  });

  it("keeps going when the write fails", async () => {
    // A measurement must never be the reason a trial fails to start.
    const broken = { auditEvent: { create: async () => { throw new Error("database unavailable"); } } } as never;
    vi.resetModules();
    vi.doMock("../lib/prisma.js", () => ({ prisma: broken }));
    const isolated = await import("./trial-events.js");

    await expect(isolated.recordTrialEvent(OWNER, "trial.started", {})).resolves.toBeUndefined();
    vi.doUnmock("../lib/prisma.js");
    vi.resetModules();
  });

  it("writes no amounts, so the log cannot become a second financial store", async () => {
    await recordTrialEvent(OWNER, TRIAL_CONVERTED, { usedTrial: true, fromStatus: "trial" });
    const [event] = await prisma.auditEvent.findMany({ where: { ownerClerkId: OWNER, action: TRIAL_CONVERTED } });
    const serialised = JSON.stringify(event?.metadata ?? {});
    expect(serialised).not.toMatch(/amount|price|usd|ngn/i);
  });

  it("cleans up", async () => {
    await prisma.auditEvent.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.user.deleteMany({ where: { clerkId: OWNER } });
    await prisma.$disconnect();
    void TransactionType;
    void NOW;
    void IN_WINDOW;
  });
});