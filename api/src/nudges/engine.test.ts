import { describe, expect, it } from "vitest";
import { emailWindowOpen, localDayOfMonth, localHour } from "./engine.js";

/**
 * The engine's job is mostly saying no.
 *
 * These cover the rules that keep a person from being emailed too often, at a
 * bad hour, or about something they have already done — every one of which is a
 * way a nudge system turns into spam.
 */

const LAGOS = "Africa/Lagos";

describe("local time", () => {
  it("reads the hour in the user's own zone", () => {
    // 09:00 UTC is 10:00 in Lagos (UTC+1).
    expect(localHour(new Date("2026-10-22T09:00:00.000Z"), LAGOS)).toBe(10);
    expect(localHour(new Date("2026-10-22T23:00:00.000Z"), LAGOS)).toBe(0);
  });

  it("falls back to UTC rather than dropping the email on an unknown zone", () => {
    // A bad zone must not silently stop every nudge for that account.
    expect(localHour(new Date("2026-10-22T09:00:00.000Z"), "Not/AZone")).toBe(9);
    expect(localDayOfMonth(new Date("2026-10-22T09:00:00.000Z"), "Not/AZone")).toBe(22);
  });
});

describe("send window", () => {
  it("sends inside 09:00-20:00 local", () => {
    // 12:00 UTC = 13:00 Lagos.
    expect(emailWindowOpen(new Date("2026-10-22T12:00:00.000Z"), LAGOS)).toBe(true);
  });

  it("does not send at 03:00 local", () => {
    // 02:00 UTC = 03:00 Lagos.
    expect(emailWindowOpen(new Date("2026-10-22T02:00:00.000Z"), LAGOS)).toBe(false);
  });

  it("does not send at 23:00 local", () => {
    // 22:00 UTC = 23:00 Lagos.
    expect(emailWindowOpen(new Date("2026-10-22T22:00:00.000Z"), LAGOS)).toBe(false);
  });

  it("is allowed on the hour the window opens and not on the one it closes", () => {
    // 08:00 UTC = 09:00 Lagos — open. 19:00 UTC = 20:00 Lagos — shut.
    expect(emailWindowOpen(new Date("2026-10-22T08:00:00.000Z"), LAGOS)).toBe(true);
    expect(emailWindowOpen(new Date("2026-10-22T19:00:00.000Z"), LAGOS)).toBe(false);
  });

  it("only asks about the hour — job collisions are a separate, dated question", () => {
    // 09:00 UTC is 10:00 in Lagos, which is inside the window. The daily jobs
    // run on UTC and the user cannot know what day it is for them, so folding
    // that into this check is both wrong and, done by comparing local dates, a
    // rule that silently never fires.
    expect(emailWindowOpen(new Date("2026-11-01T09:00:00.000Z"), LAGOS)).toBe(true);
  });
});