import { describe, expect, it } from "vitest";
import {
  detectTransfer,
  isAccountHolder,
  matchesProviderPattern,
  mentionsLoan,
  nameTokens,
  pairByReference,
  parseTransferNarration,
} from "./transfers.js";

const HOLDER = ["CHINONSO EMMANUEL Onah"];

type Row = { description: string; reference: string | null; debit: string; credit: string; subAccount: string };

/** Rows exactly as the OPay extract supplied them. */
const OPay_ROWS: Row[] = [
  { subAccount: "Wallet", reference: "090267260627072248397009750751", debit: "", credit: "800.00",
    description: "Transfer from Onah, EMMANUEL CHINONSO | Kuda MFB | 200****751 | data" },
  { subAccount: "Wallet", reference: "260627110100885471636961", debit: "804.60", credit: "",
    description: "Mobile Data | 8153324197 | Glo | 3GB 3 Days Plan" },
  { subAccount: "Wallet", reference: "260627010201885371514548", debit: "", credit: "4.60",
    description: "OWealth Withdrawal(Transaction Payment)" },
  { subAccount: "Wallet", reference: "260627140300910433245426", debit: "510.00", credit: "",
    description: "Auto-save to OWealth Balance" },
  { subAccount: "Savings", reference: "26062799K7zOQej2XStPpf7mZczP0", debit: "", credit: "0.09",
    description: "OWealth Interest Earned" },
  { subAccount: "Savings", reference: "260627010201885371514548", debit: "4.60", credit: "",
    description: "OWealth Withdrawal (Transaction Payment)" },
  { subAccount: "Savings", reference: "260627140300910433245426", debit: "", credit: "510.00",
    description: "Auto-save to OWealth Balance" },
  { subAccount: "Wallet", reference: "100022260704065354082522056797", debit: "", credit: "1690.00",
    description: "Transfer from CHINONSO ONAH | GoMoney | 850****872 | Transfer to CHINONSO EMMANUEL ONAH" },
  { subAccount: "Wallet", reference: "000013260717142150000071984541", debit: "", credit: "5000.00",
    description: "Transfer from ABUMISI ADAEZE BARBARA | Guaranty Trust Bank | 031****357 | Borrow/loan to CHINONSO EMMANUEL Onah." },
];

describe("provider patterns", () => {
  it("matches OPay internal sweeps", () => {
    expect(matchesProviderPattern("Auto-save to OWealth Balance")).toBe("pattern");
    expect(matchesProviderPattern("OWealth Withdrawal(Transaction Payment)")).toBe("pattern");
  });

  it("does NOT treat interest as a transfer — it is income", () => {
    expect(matchesProviderPattern("OWealth Interest Earned")).toBeNull();
  });

  it("tolerates the space OPay puts before the pipe", () => {
    // The configured phrase has no `|`, so a naive "Mobile Data|" literal would
    // miss this row and send it to the LLM, which is what the pattern exists to
    // prevent.
    expect(matchesProviderPattern("Mobile Data | 8153324197 | Glo | 3GB 3 Days Plan")).toBeNull();
    expect(matchesProviderPattern("Auto-save to OWealth | 510.00")).toBe("pattern");
  });
});

describe("account-holder matching", () => {
  it("matches regardless of order, case and comma placement", () => {
    expect(isAccountHolder("Onah, EMMANUEL CHINONSO", HOLDER)).toBe(true);
    expect(isAccountHolder("CHINONSO ONAH", HOLDER)).toBe(true);
    expect(isAccountHolder("chinonso emmanuel onah", HOLDER)).toBe(true);
  });

  it("does not match a third party", () => {
    expect(isAccountHolder("NGOZI PATIENCE CHUKWUBIKEM", HOLDER)).toBe(false);
    expect(isAccountHolder("ABUMISI ADAEZE BARBARA", HOLDER)).toBe(false);
  });

  it("refuses a single shared token", () => {
    expect(nameTokens("Onah").size).toBe(1);
    expect(isAccountHolder("Onah", HOLDER)).toBe(false);
  });
});

describe("reference pairing", () => {
  it("pairs both legs of an OWealth movement across sub-accounts", () => {
    const pairs = pairByReference(OPay_ROWS);
    const withdrawals = OPay_ROWS.filter((row) => row.description.includes("OWealth Withdrawal"));
    const autosaves = OPay_ROWS.filter((row) => row.description.includes("Auto-save"));
    expect(withdrawals.every((row) => pairs.get(row) === "reference")).toBe(true);
    expect(autosaves.every((row) => pairs.get(row) === "reference")).toBe(true);
  });

  it("pairs on the leading-zero reference too", () => {
    // A numeric parse would drop the leading zeros and these would stop pairing.
    const rows: Row[] = [
      { subAccount: "Wallet", reference: "000013260717142150000071984541", debit: "", credit: "10.00", description: "A" },
      { subAccount: "Savings", reference: "000013260717142150000071984541", debit: "10.00", credit: "", description: "B" },
    ];
    expect(rows.every((row) => pairByReference(rows).get(row) === "reference")).toBe(true);
  });

  it("refuses to pair two rows in the SAME section", () => {
    // A reference printed twice within one account is a duplicated line, not
    // money moving between pockets. Pairing it would delete a real expense.
    const rows: Row[] = [
      { subAccount: "Wallet", reference: "260627140300910433245426", debit: "", credit: "10.00", description: "A" },
      { subAccount: "Wallet", reference: "260627140300910433245426", debit: "10.00", credit: "", description: "B" },
    ];
    expect(pairByReference(rows).size).toBe(0);
  });

  it("refuses to pair two rows moving the same way", () => {
    // Same reference, both credits: two separate inbound payments that the bank
    // happened to stamp identically. Neither is half of the other.
    const rows: Row[] = [
      { subAccount: "Wallet", reference: "260627140300910433245426", debit: "", credit: "10.00", description: "A" },
      { subAccount: "Savings", reference: "260627140300910433245426", debit: "", credit: "10.00", description: "B" },
    ];
    expect(pairByReference(rows).size).toBe(0);
  });

  it("refuses to pair a batch of three rows on one reference", () => {
    const rows: Row[] = [
      { subAccount: "Wallet", reference: "R1", debit: "10.00", credit: "", description: "A" },
      { subAccount: "Savings", reference: "R1", debit: "", credit: "10.00", description: "B" },
      { subAccount: "Savings", reference: "R1", debit: "", credit: "5.00", description: "C" },
    ];
    expect(pairByReference(rows).size).toBe(0);
  });

  it("leaves an unpaired reference alone", () => {
    const rows = [OPay_ROWS[8]!];
    expect(pairByReference(rows).size).toBe(0);
  });
});

describe("transfer detection over the OPay extract", () => {
  const verdict = (description: string) =>
    detectTransfer(OPay_ROWS.find((row) => row.description.includes(description))!, OPay_ROWS, HOLDER);

  it("marks the two OWealth legs as transfers by reference", () => {
    expect(verdict("OWealth Withdrawal").source).toBe("reference");
    expect(verdict("Auto-save").source).toBe("reference");
  });

  it("marks Kuda and GoMoney inflows as own-account transfers by name", () => {
    expect(verdict("Kuda MFB")).toEqual({ isTransfer: true, source: "name" });
    expect(verdict("GoMoney")).toEqual({ isTransfer: true, source: "name" });
  });

  it("does NOT mark ordinary spending or a third-party payment", () => {
    expect(verdict("Mobile Data")).toBeNull();
    expect(verdict("Borrow/loan")).toBeNull();
  });

  it("does NOT mark interest as a transfer", () => {
    expect(verdict("Interest Earned")).toBeNull();
  });
});

describe("narration parsing", () => {
  it("splits counterparty, institution and purpose", () => {
    const parsed = parseTransferNarration("Transfer from Onah, EMMANUEL CHINONSO | Kuda MFB | 200****751 | data");
    expect(parsed.direction).toBe("in");
    expect(parsed.counterparty).toBe("Onah, EMMANUEL CHINONSO");
    expect(parsed.institution).toBe("Kuda MFB");
    expect(parsed.purpose).toBe("data");
  });

  it("reads direction from from/to", () => {
    expect(parseTransferNarration("Transfer to NGOZI PATIENCE CHUKWUBIKEM | OPay | 7038858821").direction).toBe("out");
  });

  it("finds the loan wording in the purpose tail", () => {
    const parsed = parseTransferNarration(
      "Transfer from ABUMISI ADAEZE BARBARA | Guaranty Trust Bank | 031****357 | Borrow/loan to CHINONSO EMMANUEL Onah.",
    );
    expect(mentionsLoan(parsed.purpose ?? "")).toBe(true);
  });

  it("returns nulls for a non-transfer narration", () => {
    expect(parseTransferNarration("USSD Charge")).toEqual({ direction: null, counterparty: null, institution: null, purpose: null });
  });
});