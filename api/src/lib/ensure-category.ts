/**
 * Looking up a seeded category by name, creating it on demand.
 *
 * Same shape as `ensureUncategorizedCategory` in the import pipeline, and for
 * the same reason: an existing account may predate the stablecoin categories,
 * so a name in `DEFAULT_CATEGORIES` is not a row that exists yet. Resolving by
 * name and creating on a miss is what lets a confirmation path apply a category
 * without first running a migration over every tenant's ledger.
 */

import { prisma } from "./prisma.js";

/**
 * Returns the id of a category the user has, creating it if they do not.
 *
 * Case-insensitive so a user who renamed or retyped "Uncategorized" still
 * resolves. Archived categories are reused rather than duplicated: the row still
 * holds the right name and the user's archive decision was not about this.
 */
export async function ensureCategory(ownerClerkId: string, name: string): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: { ownerClerkId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({ data: { ownerClerkId, name } });
  return created.id;
}