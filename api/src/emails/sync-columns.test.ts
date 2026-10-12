import { describe, expect, it } from "vitest";
import { syncColumns, type SyncCounts } from "./sync.js";

/**
 * `cappedByTrial` exists on the counts object for the log line and is not a
 * column on `EmailSyncJob`. Spreading the whole object into an update made
 * Prisma reject the write — and because there are three call sites, fixing one
 * left the error alive. This pins the field that must never be written.
 */
describe("syncColumns", () => {
  const counts: SyncCounts = {
    scanned: 2,
    imported: 1,
    duplicates: 3,
    duplicateRows: 0,
    skipped: 5,
    failed: 0,
    cappedByTrial: true,
  };

  it("carries only columns, so any future extra key is dropped by default", () => {
    // The failure mode this guards is a repeat, not the original bug: a new
    // field on SyncCounts must never be able to reject the write again.
    const columns = syncColumns({ ...counts, someNewField: "x" } as never);
    expect(Object.keys(columns).sort()).toEqual(
      ["duplicates", "duplicateRows", "failed", "imported", "scanned", "skipped"].sort(),
    );
  });

  it("drops cappedByTrial, which is not a column", () => {
    const columns = syncColumns(counts);
    expect(columns).not.toHaveProperty("cappedByTrial");
  });

  it("keeps every real counter", () => {
    expect(syncColumns(counts)).toEqual({
      scanned: 2,
      imported: 1,
      duplicates: 3,
      duplicateRows: 0,
      skipped: 5,
      failed: 0,
    });
  });

  it("keeps the keys even when the flag is false or absent", () => {
    // Shape, not truthiness: a falsy flag must not change the column set.
    expect(Object.keys(syncColumns({ ...counts, cappedByTrial: false })).sort()).toEqual(
      Object.keys(syncColumns(counts)).sort(),
    );
  });
});
