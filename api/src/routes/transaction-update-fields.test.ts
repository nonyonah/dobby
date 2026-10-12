import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The save reported success and changed nothing.
 *
 * The client sent `recurring`, the PATCH schema accepted `isRecurring`, and
 * zod strips keys it does not recognise rather than rejecting them. So the
 * update ran, omitted the field, and returned 200 with "Transaction updated" —
 * indistinguishable from a save that worked. The toggle snapped back on reopen
 * and nothing anywhere showed the row as recurring.
 *
 * These check the two halves actually agree, because neither unit test would
 * have caught the mismatch on its own: a schema that accepts the field proves
 * nothing if the client sends a different name.
 */

// src/routes -> src -> api -> repo root
const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const route = read("api/src/routes/transactions.ts");
const reviews = read("api/src/routes/reviews.ts");
const page = read("web/components/transactions-page.tsx");

/** Field names the PATCH body builder sends that must exist in the schema. */
const SENT_FIELDS = [
  "type",
  "categoryId",
  "isTaxable",
  "isRecurring",
  "amount",
  "description",
  "subAccount",
  "currency",
  "occurredAt",
  "source",
  "reference",
  "metadata",
  "needsReview",
  "incomeSource",
];

describe("transaction update fields", () => {
  it("sends isRecurring, the name the API accepts", () => {
    expect(page).toMatch(/isRecurring:\s*next\.recurring/);
    // The bug itself: a body key with no counterpart in the schema.
    expect(page).not.toMatch(/^\s*recurring:\s*next\./m);
  });

  it("accepts isRecurring on the transaction PATCH", () => {
    expect(route).toMatch(/isRecurring:\s*z\.boolean\(\)/);
  });

  it("treats a recurring decision as a user decision", () => {
    // Otherwise a later rule pass can quietly revert it.
    expect(route).toMatch(/DECISION_FIELDS\s*=\s*\[[^\]]*"isRecurring"/);
  });

  it("carries isRecurring through the review queue", () => {
    expect(reviews).toMatch(/isRecurring:\s*z\.boolean\(\)/);
    expect(reviews).toMatch(/isRecurring\?:\s*boolean/);
    // Edit in the queue, then approve: the flag has to survive both steps.
    expect(reviews).toMatch(/input\.isRecurring !== undefined\s*\n\s*\?\s*\{ isRecurring: input\.isRecurring \}/);
  });

  it("sends every field the client sends to a schema that has it", () => {
    const bodyMatch = page.match(/const body = \{([\s\S]*?)\n {6}\};/);
    expect(bodyMatch, "could not locate the PATCH body builder").toBeTruthy();
    const body = bodyMatch![1];
    const keys = [...body.matchAll(/^\s*([A-Za-z]+):/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) {
      if (!SENT_FIELDS.includes(key)) continue;
      expect(route, `client sends "${key}" but the route has no such field`).toMatch(new RegExp(`\\b${key}:`));
    }
  });
});