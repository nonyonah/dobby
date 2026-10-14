import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportStatus, type ImportType } from "@prisma/client";

/**
 * A statement arriving twice, by two different routes.
 *
 * The same file reaches Dobby two ways: the bank emails it and Composio picks
 * it up, or the user downloads it and uploads it. Both create a
 * `TransactionImport`, and the byte hash is the only thing that recognises them
 * as the same file — the rows inside are identical but arrive as separate
 * review items.
 *
 * The email path checked only `EmailImport` for a repeat and relied on a unique
 * constraint for everything else, while the manual path checked only
 * `TransactionImport`. Neither looked at the other's table. This covers both
 * orderings, because "email first" and "upload first" are different races and
 * only one of them can be true for any given user.
 *
 * Opt-in, because it writes:
 *   DOBBY_DB_PARITY=1 DATABASE_URL=postgresql://... npx vitest run src/imports/cross-source-duplicates.verify.test.ts
 */

const RUN = process.env.DOBBY_DB_PARITY === "1";
const OWNER = "user_cross_source_verify";

// A distinct byte string per test, so one test's claim cannot satisfy another.
let FILE = Buffer.from("");

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

let prisma: typeof import("../lib/prisma.js").prisma;
let fingerprintFor: (d: string, a: number, desc: string) => string;
let shortCircuitIfAlreadyImported: typeof import("./pipeline.js").shortCircuitIfAlreadyImported;
let findCompletedImportByHash: typeof import("./pipeline.js").findCompletedImportByHash;
let findImportHoldingHash: typeof import("./pipeline.js").findImportHoldingHash;
let findDuplicateFingerprints: typeof import("./pipeline.js").findDuplicateFingerprints;
let hashOf: (bytes: Buffer) => string;

beforeEach(async () => {
  if (!RUN) return;
  ({ prisma } = await import("../lib/prisma.js"));
  const pipeline = await import("./pipeline.js");
  ({ shortCircuitIfAlreadyImported, findCompletedImportByHash, findImportHoldingHash, findDuplicateFingerprints } = pipeline);
  const { createHash } = await import("node:crypto");
  ({ fingerprintFor } = await import("./pipeline.js"));
  hashOf = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

  FILE = Buffer.from(`statement-${Math.random().toString(36)}`);
  await prisma.user.upsert({ where: { clerkId: OWNER }, create: { clerkId: OWNER }, update: {} });
  await prisma.transactionImport.deleteMany({ where: { ownerClerkId: OWNER } });
  await prisma.emailImport.deleteMany({ where: { ownerClerkId: OWNER } });
  await prisma.transactionReviewItem.deleteMany({ where: { ownerClerkId: OWNER } });
});

afterAll(async () => {
  if (!RUN) return;
  await prisma.$disconnect();
});

/** Creates an import the way an upload or an email attachment does. */
async function makeImport(input: { name: string; hash?: string | null; status: ImportStatus }) {
  return prisma.transactionImport.create({
    data: {
      ownerClerkId: OWNER,
      type: "CSV" as ImportType,
      status: input.status,
      originalName: input.name,
      objectKey: `users/${OWNER}/imports/${Math.random().toString(36)}.csv`,
      contentHash: input.hash ?? null,
      rowCount: 3,
    },
  });
}

/** Stands in for extraction writing proposed rows for an import. */
async function seedPendingReview(importId: string, rows: Array<{ date: string; description: string; amount: number }>) {
  await prisma.transactionReviewItem.createMany({
    data: rows.map((row, index) => ({
      ownerClerkId: OWNER,
      importId,
      rowNumber: index + 2,
      status: "PENDING" as const,
      rawData: row,
      proposedData: { type: row.amount > 0 ? "INCOME" : "EXPENSE", amount: Math.abs(row.amount), description: row.description, occurredAt: row.date },
      fingerprint: fingerprintFor(row.date, row.amount, row.description),
    })),
  });
}

describe.runIf(RUN)("cross-source duplicates", () => {
  it("refuses a manual upload of a file the email already imported", async () => {
    // Email first: the email path writes the hash at creation.
    const viaEmail = await makeImport({ name: "statement.pdf", hash: hashOf(FILE), status: ImportStatus.REVIEW });
    const manual = await makeImport({ name: "statement.pdf", hash: null, status: ImportStatus.CREATED });

    const refused = await shortCircuitIfAlreadyImported(OWNER, manual.id, FILE);

    expect(refused, "a manual upload of an already-imported file must be refused").toBe(true);
    const settled = await prisma.transactionImport.findUnique({ where: { id: manual.id }, select: { status: true } });
    expect(settled?.status).not.toBe(ImportStatus.CREATED);
    void viaEmail;
  });

  it("refuses an email of a file the user already uploaded", async () => {
    // Upload first. The manual path claims the hash when it processes, so the
    // email's own lookup — which only ever consulted EmailImport — would have
    // found nothing here.
    const manual = await makeImport({ name: "statement.pdf", hash: null, status: ImportStatus.CREATED });
    expect(await shortCircuitIfAlreadyImported(OWNER, manual.id, FILE)).toBe(false);
    await prisma.transactionImport.update({ where: { id: manual.id }, data: { status: ImportStatus.COMPLETED } });

    const viaEmail = await makeImport({ name: "statement.pdf", hash: null, status: ImportStatus.CREATED });
    const refused = await shortCircuitIfAlreadyImported(OWNER, viaEmail.id, FILE);

    expect(refused).toBe(true);
    const settled = await prisma.transactionImport.findUnique({ where: { id: viaEmail.id }, select: { status: true } });
    expect(settled?.status).not.toBe(ImportStatus.CREATED);
  });

  it("refuses a second copy of the same file within one source", async () => {
    const first = await makeImport({ name: "statement.pdf", hash: null, status: ImportStatus.CREATED });
    expect(await shortCircuitIfAlreadyImported(OWNER, first.id, FILE)).toBe(false);
    await prisma.transactionImport.update({ where: { id: first.id }, data: { status: ImportStatus.COMPLETED } });

    const second = await makeImport({ name: "statement-copy.pdf", hash: null, status: ImportStatus.CREATED });
    expect(await shortCircuitIfAlreadyImported(OWNER, second.id, FILE)).toBe(true);
  });

  it("does not confuse two different files", async () => {
    const first = await makeImport({ name: "january.pdf", hash: null, status: ImportStatus.CREATED });
    expect(await shortCircuitIfAlreadyImported(OWNER, first.id, FILE)).toBe(false);
    await prisma.transactionImport.update({ where: { id: first.id }, data: { status: ImportStatus.COMPLETED } });

    const other = await makeImport({ name: "february.pdf", hash: null, status: ImportStatus.CREATED });
    const differentBytes = Buffer.from(`other-${Math.random().toString(36)}`);
    expect(await shortCircuitIfAlreadyImported(OWNER, other.id, differentBytes)).toBe(false);
  });

  it("lets a file that failed be retried", async () => {
    // A locked PDF failing must not permanently block the user from re-uploading
    // an unlocked copy, which has different bytes anyway — but the same file
    // retried after a transient failure should work too.
    const failed = await makeImport({ name: "statement.pdf", hash: null, status: ImportStatus.FAILED });
    await prisma.transactionImport.update({ where: { id: failed.id }, data: { contentHash: hashOf(FILE) } });

    const retry = await makeImport({ name: "statement.pdf", hash: null, status: ImportStatus.CREATED });
    expect(await findCompletedImportByHash(OWNER, hashOf(FILE))).toBeNull();
    expect(await findImportHoldingHash(OWNER, hashOf(FILE))).toBeNull();
    expect(await shortCircuitIfAlreadyImported(OWNER, retry.id, FILE)).toBe(false);
  });

  it("does not put the same rows in the queue twice", async () => {
    /*
     * The case a byte hash cannot catch.
     *
     * A bank that regenerates a statement, or a PDF saved through another tool,
     * produces different bytes for the same statement. The hash is then a
     * different file as far as the dedupe is concerned, and both copies extract
     * — so the review queue shows every row twice, and approving the lot
     * double-counts the month.
     *
     * Existing fingerprint dedupe only compares against *approved* transactions,
     * so the second copy slips past while the first is still pending.
     */
    const date = "2026-05-04";
    const rows = [
      { date, description: "Coffee shop", amount: -450 },
      { date, description: "Salary", amount: 250_000 },
    ];

    const first = await makeImport({ name: "may.pdf", hash: hashOf(FILE), status: ImportStatus.PROCESSING });
    await seedPendingReview(first.id, rows);

    // Same statement, different bytes, still pending.
    const reissued = Buffer.from(`statement-again-${Math.random().toString(36)}`);
    const second = await makeImport({ name: "may-copy.pdf", hash: null, status: ImportStatus.CREATED });
    await seedPendingReview(second.id, rows);

    // The real rule: does the second import see the first one's rows?
    const secondFingerprints = rows.map((row) => fingerprintFor(row.date, row.amount, row.description));
    const duplicates = await findDuplicateFingerprints(OWNER, secondFingerprints, second.id);

    expect(duplicates.size, "a re-issued statement must not queue its rows a second time").toBe(2);
    void reissued;
  });

  it("recognises an in-flight import so a second copy does not wait on it", async () => {
    const inFlight = await makeImport({ name: "statement.pdf", hash: hashOf(FILE), status: ImportStatus.PROCESSING });
    const second = await makeImport({ name: "statement.pdf", hash: null, status: ImportStatus.CREATED });

    // Not settled yet, so findCompletedImportByHash is null — but the bytes are
    // already claimed, and the claim is what stops the second extraction.
    expect(await findCompletedImportByHash(OWNER, hashOf(FILE))).toBeNull();
    expect(await findImportHoldingHash(OWNER, hashOf(FILE))).toMatchObject({ id: inFlight.id });
    expect(await shortCircuitIfAlreadyImported(OWNER, second.id, FILE)).toBe(true);
  });
});