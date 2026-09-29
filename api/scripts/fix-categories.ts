/**
 * One-time cleanup for the categorization conflation bug.
 *
 * 1. Deletes document/source-type categories (Statement, Receipt, …) and
 *    remaps their transactions to Uncategorized.
 * 2. Resets INCOME transactions sitting in "Income" that today's fixed
 *    keyword/rule logic cannot justify (e.g. withdrawals, fees, transfers).
 * 3. Backfills null-category transactions: confident keyword/rule matches get
 *    assigned, everything else becomes explicitly Uncategorized.
 *
 * Idempotent and scoped per user. Usage:
 *   npx tsx scripts/fix-categories.ts [--dry-run] [ownerClerkId]
 */
import { PrismaClient } from "@prisma/client";
import { suggestCategory } from "../src/lib/categorize.js";

const prisma = new PrismaClient();

const DOCUMENT_TYPES = new Set(["statement", "statements", "receipt", "receipts", "email", "emails", "alert", "alerts", "sms", "pdf", "csv", "xls", "xlsx"]);

const dryRun = process.argv.includes("--dry-run");
const onlyOwner = process.argv.find((arg) => arg.startsWith("user_")) ?? null;

async function ensureUncategorized(ownerClerkId: string): Promise<{ id: string; name: string }> {
  const existing = await prisma.category.findFirst({ where: { ownerClerkId, name: { equals: "uncategorized", mode: "insensitive" } } });
  if (existing) return { id: existing.id, name: existing.name };
  if (dryRun) return { id: "(dry-run)", name: "Uncategorized" };
  const created = await prisma.category.create({ data: { ownerClerkId, name: "Uncategorized" } });
  return { id: created.id, name: created.name };
}

async function fixOwner(ownerClerkId: string) {
  const report = { purged: 0, incomeReset: 0, assigned: 0, uncategorized: 0 };
  const categories = await prisma.category.findMany({ where: { ownerClerkId }, select: { id: true, name: true } });
  const rules = await prisma.categorizationRule.findMany({ where: { ownerClerkId }, select: { matcher: true, categoryId: true } });
  const refs = categories.map((c) => ({ id: c.id, name: c.name }));
  const uncat = await ensureUncategorized(ownerClerkId);
  const byId = new Map(categories.map((c) => [c.id, c.name]));

  // 1. Document-type categories.
  for (const category of categories) {
    if (!DOCUMENT_TYPES.has(category.name.trim().toLowerCase())) continue;
    const moved = dryRun
      ? await prisma.transaction.count({ where: { ownerClerkId, categoryId: category.id } })
      : (await prisma.transaction.updateMany({ where: { ownerClerkId, categoryId: category.id }, data: { categoryId: uncat.id } })).count;
    if (!dryRun) await prisma.category.delete({ where: { id: category.id } }).catch(() => undefined);
    report.purged += moved;
    console.log(`  purged category "${category.name}": ${moved} transactions -> Uncategorized`);
  }

  // 2 + 3. Income fallback victims and null-category rows.
  const rows = await prisma.transaction.findMany({
    where: { ownerClerkId, OR: [{ categoryId: null }, { category: { name: { equals: "income", mode: "insensitive" } } }] },
    select: { id: true, type: true, description: true, merchant: true, categoryId: true },
  });
  const toUncat: string[] = [];
  const toAssign = new Map<string, string[]>();
  for (const row of rows) {
    const descriptor = row.merchant ?? row.description ?? "";
    const suggestion = suggestCategory(descriptor, row.type, refs, rules);
    if (suggestion) {
      if (suggestion.categoryId !== row.categoryId) {
        const list = toAssign.get(suggestion.categoryId) ?? [];
        list.push(row.id);
        toAssign.set(suggestion.categoryId, list);
      }
      continue;
    }
    // No justification: null stays out of totals, and an unjustified Income
    // label is worse than none. Already-Uncategorized rows are untouched.
    if (row.categoryId && byId.get(row.categoryId)?.toLowerCase() !== "uncategorized") toUncat.push(row.id);
    else if (!row.categoryId) toUncat.push(row.id);
  }
  for (const [categoryId, ids] of toAssign) {
    if (!dryRun) {
      for (let i = 0; i < ids.length; i += 500) {
        await prisma.transaction.updateMany({ where: { id: { in: ids.slice(i, i + 500) } }, data: { categoryId } });
      }
    }
    report.assigned += ids.length;
    console.log(`  assigned ${ids.length} rows -> ${byId.get(categoryId) ?? categoryId}`);
  }
  if (toUncat.length > 0 && !dryRun) {
    for (let i = 0; i < toUncat.length; i += 500) {
      await prisma.transaction.updateMany({ where: { id: { in: toUncat.slice(i, i + 500) } }, data: { categoryId: uncat.id } });
    }
  }
  report.uncategorized = toUncat.length;
  console.log(`  uncategorized: ${toUncat.length} rows`);
  return report;
}

async function main() {
  const owners = onlyOwner
    ? [{ clerkId: onlyOwner }]
    : await prisma.user.findMany({ select: { clerkId: true } });
  console.log(`fix-categories ${dryRun ? "(dry run) " : ""}— ${owners.length} user(s)`);
  for (const owner of owners) {
    console.log(`user ${owner.clerkId}`);
    try {
      console.log(" ", JSON.stringify(await fixOwner(owner.clerkId)));
    } catch (error) {
      console.log("  FAILED:", error instanceof Error ? error.message : String(error));
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
