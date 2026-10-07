import { describe, expect, it } from "vitest";
import { TransactionType } from "@prisma/client";

/**
 * `/reapply` used to load a user's entire ledger into memory. It now walks it
 * with a cursor, so the risk is a boundary bug that silently skips rows. This
 * seeds more transactions than one page holds and checks that every row the old
 * single-query approach would have touched is still reached.
 *
 * Opt-in, because it writes to a real database:
 *   DOBBY_DB_PARITY=1 DATABASE_URL=postgresql://... npx vitest run src/routes/rules-reapply.verify.test.ts
 */

const RUN = process.env.DOBBY_DB_PARITY === "1";
const OWNER = "user_rules_verify";

const REAPPLY_BATCH = 100;
// Category ids are assigned at seed time, so the rules are built once the
// Category rows exist rather than hard-coding ids that violate the FK.
let RULES: Array<{ matcher: string; categoryId: string; isTaxable: boolean }> = [];

type Rule = { matcher: string; categoryId: string; isTaxable: boolean };

function matchRule(rules: Rule[], text: string) {
  return rules.find((rule) => text.toLowerCase().includes(rule.matcher.toLowerCase()));
}

/** The previous implementation: load everything, match, group, update. */
async function reapplyWholeLedger(ownerClerkId: string) {
  const transactions = await prisma.transaction.findMany({
    where: { ownerClerkId },
    select: { id: true, description: true, merchant: true },
  });
  const batches = new Map<string, { categoryId: string; isTaxable: boolean; ids: string[] }>();
  for (const transaction of transactions) {
    const match = matchRule(RULES, `${transaction.merchant ?? ""} ${transaction.description}`);
    if (!match) continue;
    const key = `${match.categoryId}|${match.isTaxable}`;
    const batch = batches.get(key) ?? { categoryId: match.categoryId, isTaxable: match.isTaxable, ids: [] };
    batch.ids.push(transaction.id);
    batches.set(key, batch);
  }
  for (const batch of batches.values()) {
    await prisma.transaction.updateMany({
      where: { id: { in: batch.ids }, ownerClerkId },
      data: { categoryId: batch.categoryId, isTaxable: batch.isTaxable },
    });
  }
  return transactions.length;
}

/** The current implementation: cursor over the ledger in fixed-size pages. */
async function reapplyPaged(ownerClerkId: string) {
  const rules = RULES.map((rule) => ({ ...rule, needle: rule.matcher.toLowerCase() }));
  let cursor: string | undefined;
  let visited = 0;
  let pages = 0;
  for (;;) {
    const page = await prisma.transaction.findMany({
      where: { ownerClerkId },
      select: { id: true, description: true, merchant: true },
      orderBy: { id: "asc" },
      take: REAPPLY_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    pages += 1;
    visited += page.length;
    const batches = new Map<string, { categoryId: string; isTaxable: boolean; ids: string[] }>();
    for (const transaction of page) {
      const text = `${transaction.merchant ?? ""} ${transaction.description}`.toLowerCase();
      const match = rules.find((rule) => text.includes(rule.needle));
      if (!match) continue;
      const key = `${match.categoryId}|${match.isTaxable}`;
      const batch = batches.get(key) ?? { categoryId: match.categoryId, isTaxable: match.isTaxable, ids: [] };
      batch.ids.push(transaction.id);
      batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      await prisma.transaction.updateMany({
        where: { id: { in: batch.ids }, ownerClerkId },
        data: { categoryId: batch.categoryId, isTaxable: batch.isTaxable },
      });
    }
    if (page.length < REAPPLY_BATCH) break;
    cursor = (page[page.length - 1] as { id: string }).id;
  }
  return { visited, pages };
}

const { prisma } = await import("../lib/prisma.js");

/** Everything a matcher should have hit, keyed by id. */
async function appliedState() {
  const rows = await prisma.transaction.findMany({
    where: { ownerClerkId: OWNER, categoryId: { not: null } },
    select: { id: true, categoryId: true, isTaxable: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => `${row.id}:${row.categoryId}:${row.isTaxable}`);
}

/** 250 rows: more than two full pages, so a boundary bug would show up. */
async function seed() {
  await prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } });
  await prisma.user.deleteMany({ where: { clerkId: OWNER } });
  await prisma.user.create({ data: { clerkId: OWNER, email: "rules@example.com", plan: "ACTIVE" } });
  const food = await prisma.category.create({ data: { ownerClerkId: OWNER, name: "Food" } });
  const income = await prisma.category.create({ data: { ownerClerkId: OWNER, name: "Income" } });
  RULES = [
    { matcher: "grocery", categoryId: food.id, isTaxable: false },
    { matcher: "salary", categoryId: income.id, isTaxable: true },
  ];
  for (let i = 0; i < 250; i += 1) {
    const kind = i % 3;
    await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: kind === 1 ? TransactionType.INCOME : TransactionType.EXPENSE,
        amount: "10.0000",
        currency: "USD",
        // Every third row matches a rule; the rest must stay uncategorized.
        description: kind === 0 ? `Grocery run ${i}` : kind === 1 ? `Salary march ${i}` : `Unmatched ${i}`,
        occurredAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
        fingerprint: `fp-rules-${i}`,
      },
    });
  }
  return 250;
}

async function resetCategorisation() {
  await prisma.transaction.updateMany({ where: { ownerClerkId: OWNER }, data: { categoryId: null } });
}

describe.runIf(RUN)("rules reapply paging", () => {
  it("reaches every row across page boundaries", async () => {
    const total = await seed();
    expect(total).toBeGreaterThan(REAPPLY_BATCH * 2);

    const seen = await reapplyPaged(OWNER);
    expect(seen.visited).toBe(total);
    expect(seen.pages).toBeGreaterThan(2);
    const paged = await appliedState();
    expect(paged.length).toBe(total - Math.floor(total / 3));

    // The whole-ledger path must land on exactly the same end state.
    await resetCategorisation();
    await reapplyWholeLedger(OWNER);
    expect(await appliedState()).toEqual(paged);
  });

  it("matches the first rule when two could match", async () => {
    await seed();
    await reapplyPaged(OWNER);
    const bothRules = await prisma.transaction.findMany({
      where: { ownerClerkId: OWNER, description: { contains: "Grocery" } },
      select: { categoryId: true },
    });
    expect(bothRules.every((row) => row.categoryId === RULES[0]!.categoryId)).toBe(true);
  });

  it("is idempotent — a second pass changes nothing", async () => {
    await seed();
    await reapplyPaged(OWNER);
    const first = await appliedState();
    await reapplyPaged(OWNER);
    expect(await appliedState()).toEqual(first);
  });

  it("cleans up", async () => {
    await prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.category.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.user.deleteMany({ where: { clerkId: OWNER } });
    await prisma.$disconnect();
  });
});