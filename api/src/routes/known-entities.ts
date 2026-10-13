/**
 * Known providers and protocols, editable at runtime.
 *
 * The seed in `api/src/stablecoin/seed.ts` ships names and narration patterns
 * and leaves every address empty, because an address is an identity claim and a
 * wrong one marks a stranger's transfer as this user's yield. That leaves no
 * address-based matching until somebody fills one in — so this page exists to
 * make filling one a two-field job rather than a deploy.
 *
 * Read-only to everyone but the writer of the address, and there is no admin
 * role in Dobby, so this is deliberately not behind one. Editing a shared seed
 * row changes detection for everyone; the per-user alternative — "remember this
 * sender" on a review card — is the one that touches nobody else, and the page
 * says so rather than pretending the global list is the better tool.
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";

export const knownEntitiesRouter = Router();

// Every /v1 router except the billing webhook requires auth. Without this a
// caller reaches these handlers with `req.auth` unset, and `req.auth!.userId`
// silently becomes null rather than throwing — which reads as an empty result
// instead of a 401.
knownEntitiesRouter.use(requireAuth);

const kindSchema = z.enum(["offramp_provider", "onramp_provider", "yield_protocol", "yield_token"]);

const entitySchema = z.object({
  kind: kindSchema,
  name: z.string().trim().min(1).max(80),
  chain: z.enum(["BASE", "SOLANA"]).nullable().optional(),
  /** Lower-cased substrings, or `/…/` for an exact regex. */
  narrationPatterns: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  notes: z.string().trim().max(500).nullable().optional(),
});

const updateSchema = z.object({
  /** Only an address may be added here. Everything else is seed-owned. */
  address: z.string().trim().min(4).max(128).nullable(),
  narrationPatterns: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

knownEntitiesRouter.get("/", async (_req, res) => {
  const rows = await prisma.knownEntity.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] });
  res.json({
    data: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      chain: row.chain,
      address: row.address,
      narrationPatterns: row.narrationPatterns,
      notes: row.notes,
    })),
  });
});

/**
 * Adds or clears an address.
 *
 * `kind` and `name` are not editable, and `name` is the seed key — a rename
 * would silently re-seed the old name on the next deploy and put two rows for
 * one provider back. An address is the field that has to be right, and the one
 * field a person can actually look up, so that is the only thing exposed.
 */
knownEntitiesRouter.patch("/:id", async (req, res) => {
  const input = updateSchema.parse(req.body ?? {});
  const existing = await prisma.knownEntity.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) throw new AppError(404, "That provider was not found.", "KNOWN_ENTITY_NOT_FOUND");

  const row = await prisma.knownEntity.update({
    where: { id: existing.id },
    data: {
      address: input.address ? input.address.trim() : null,
      ...(input.narrationPatterns ? { narrationPatterns: input.narrationPatterns.map((pattern) => pattern.toLowerCase()) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  res.json({ data: { id: row.id, address: row.address, narrationPatterns: row.narrationPatterns, notes: row.notes } });
});

/**
 * The user's own entities — the ones "remember this sender" creates.
 *
 * Read-only here on purpose: these are created from a review card, where the
 * user is looking at the transaction that justifies the entry.
 */
knownEntitiesRouter.get("/mine", async (req, res) => {
  const rows = await prisma.userEntity.findMany({ where: { ownerClerkId: req.auth!.userId }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  res.json({ data: rows });
});

knownEntitiesRouter.delete("/mine/:id", async (req, res) => {
  const result = await prisma.userEntity.deleteMany({ where: { id: req.params.id, ownerClerkId: req.auth!.userId } });
  if (result.count === 0) throw new AppError(404, "That entry was not found.", "USER_ENTITY_NOT_FOUND");
  res.status(204).send();
});