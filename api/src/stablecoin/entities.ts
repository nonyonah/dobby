/**
 * Entity resolution: which providers and protocols this user's activity touches.
 *
 * Two layers, user's first. A per-user entity exists because the user said so
 * ("remember this sender as an offramp"), and it outranks our shared seed — a
 * user who tells us something about their own money is right about it.
 *
 * An entity with no address is narration-only. That is not a degraded mode to be
 * papered over: an address is an identity claim, and we refuse to guess one. An
 * address-less entity can raise a suggestion's confidence, never confirm it.
 */

import { type Chain } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type EntityKind = "offramp_provider" | "onramp_provider" | "yield_protocol" | "yield_token";

export type ResolvedEntity = {
  id: string;
  kind: string;
  name: string;
  chain: Chain | null;
  address: string | null;
  narrationPatterns: string[];
  notes: string | null;
  source: "user" | "known";
};

export type ResolvedEntitySet = {
  offramps: ResolvedEntity[];
  onramps: ResolvedEntity[];
  yieldProtocols: ResolvedEntity[];
  yieldTokens: ResolvedEntity[];
};

function toResolved(row: {
  id: string;
  kind: string;
  name: string;
  chain: Chain | null;
  address: string | null;
  narrationPatterns: string[];
  notes: string | null;
}, source: ResolvedEntity["source"]): ResolvedEntity {
  return { ...row, source, narrationPatterns: row.narrationPatterns.map((pattern) => pattern.toLowerCase()) };
}

/** User entities shadow shared ones of the same kind and name. */
function merge(user: ResolvedEntity[], known: ResolvedEntity[]): ResolvedEntity[] {
  const taken = new Set(user.map((entity) => `${entity.kind}:${entity.name.toLowerCase()}`));
  return [...user, ...known.filter((entity) => !taken.has(`${entity.kind}:${entity.name.toLowerCase()}`))];
}

export async function resolveEntities(ownerClerkId: string): Promise<ResolvedEntitySet> {
  const [userRows, knownRows] = await Promise.all([
    prisma.userEntity.findMany({ where: { ownerClerkId } }),
    prisma.knownEntity.findMany(),
  ]);
  const user = userRows.map((row) => toResolved(row, "user"));
  const known = knownRows.map((row) => toResolved(row, "known"));

  const byKind = (kind: EntityKind) => [...merge(user.filter((entity) => entity.kind === kind), known.filter((entity) => entity.kind === kind))];

  return {
    offramps: byKind("offramp_provider"),
    onramps: byKind("onramp_provider"),
    yieldProtocols: byKind("yield_protocol"),
    yieldTokens: byKind("yield_token"),
  };
}

/**
 * Matches narration against an entity's patterns.
 *
 * A `/…/` pattern is treated as a regex so an exact sender can be pinned without
 * being so broad it matches the wrong one; anything else is a substring, which
 * is what keeps a provider name from matching inside an unrelated word.
 */
export function narrationMatches(entity: ResolvedEntity, narration: string | null | undefined): boolean {
  if (!narration) return false;
  const text = narration.toLowerCase();
  return entity.narrationPatterns.some((pattern) => {
    if (!pattern) return false;
    if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
      const source = pattern.slice(1, pattern.lastIndexOf("/"));
      try {
        return new RegExp(source, "i").test(text);
      } catch {
        // A malformed pattern must not take the whole scan down with it.
        return false;
      }
    }
    return text.includes(pattern);
  });
}

export function matchByNarration(entities: ResolvedEntity[], narration: string | null | undefined): ResolvedEntity | null {
  return entities.find((entity) => narrationMatches(entity, narration)) ?? null;
}

/** Address match is exact and case-insensitive, and only when an address exists. */
export function matchByAddress(entities: ResolvedEntity[], address: string | null | undefined): ResolvedEntity | null {
  if (!address) return null;
  const key = address.toLowerCase();
  return entities.find((entity) => entity.address !== null && entity.address.toLowerCase() === key) ?? null;
}

/** Upserts the shared seed. Addresses stay null unless the file provides one. */
export async function seedKnownEntities(
  seeds: Array<{ kind: string; name: string; chain?: Chain; address: null; narrationPatterns: string[]; notes?: string }>,
): Promise<{ created: number }> {
  let created = 0;
  for (const seed of seeds) {
    const existing = await prisma.knownEntity.findFirst({ where: { kind: seed.kind, name: seed.name, chain: seed.chain ?? null }, select: { id: true } });
    if (existing) continue;
    await prisma.knownEntity.create({ data: { kind: seed.kind, name: seed.name, chain: seed.chain ?? null, address: seed.address, narrationPatterns: seed.narrationPatterns.map((pattern) => pattern.toLowerCase()), notes: seed.notes ?? null } });
    created += 1;
  }
  return { created };
}