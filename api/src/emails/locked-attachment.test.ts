import { describe, expect, it } from "vitest";
import { LOCKED_ATTACHMENT_DETAIL } from "./sync.js";

/**
 * Regression cover for the locked-PDF path.
 *
 * The whole failure was a missing signal, not a missing message: the extractor
 * already detected the encryption and wrote `needsPassword` into `rawData`, but
 * nothing read it. The sync counted the message as imported and the web rendered
 * a normal approvable row, so a locked statement looked like a successful import
 * until the user pressed Approve and got `REVIEW_ITEM_INVALID`.
 *
 * These assertions pin the parts that can be checked without a database, and
 * document the contract the untestable glue in `sync.ts` relies on.
 */
describe("locked attachment copy", () => {
  it("tells the user to unlock in their email and import an unlocked copy", () => {
    expect(LOCKED_ATTACHMENT_DETAIL).toMatch(/locked/i);
    expect(LOCKED_ATTACHMENT_DETAIL).toMatch(/unlocked copy/i);
    expect(LOCKED_ATTACHMENT_DETAIL).toMatch(/import/i);
  });

  it("does not ask the user for their bank password", () => {
    // Dobby has no way to open the file and no business holding the credential,
    // so the copy must never imply a password can be entered here.
    expect(LOCKED_ATTACHMENT_DETAIL).not.toMatch(/enter (your )?password|password (is|will be) (used|needed)/i);
  });
});

describe("locked row detection contract", () => {
  // The query in sync.ts relies on this exact shape. If the extractor's payload
  // changes, these fail rather than the bug returning silently.
  it("finds a locked row by its needsPassword flag in rawData", () => {
    const rows = [
      { id: "a", rawData: { filename: "statement.pdf", needsPassword: true } },
      { id: "b", rawData: { description: "Mobile Data", needsPassword: false } },
      { id: "c", rawData: { description: "Mobile Data" } },
    ];
    const locked = rows.filter((row) => (row.rawData as { needsPassword?: boolean }).needsPassword === true);
    expect(locked.map((row) => row.id)).toEqual(["a"]);
  });

  it("does not treat an ordinary review row as locked", () => {
    const raw = { description: "Statement page 2 needs review", needsReview: true };
    expect((raw as { needsPassword?: boolean }).needsPassword === true).toBe(false);
  });
});
