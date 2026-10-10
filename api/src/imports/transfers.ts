/**
 * Transfer detection.
 *
 * A transfer is money moving between pockets the person owns. It is not income
 * and not spending, so it must be excluded from both, from cash flow, and from
 * tax. The hard part is telling it apart from a real inbound payment, and a
 * person-to-person transfer with no narration is genuinely indistinguishable
 * from income without asking — which is why the verdict is recorded with its
 * source and stays overridable rather than being silently applied.
 *
 * Detection runs in three passes, strongest evidence first:
 *
 *   1. **Reference.** The same bank reference appearing twice inside one
 *      document, once as a debit and once as a credit. This is arithmetic, not
 *      inference, so it wins outright.
 *   2. **Provider pattern.** A configured table of a provider's own wording for
 *      its internal sweep ("Auto-save to OWealth"). Kept in config rather than
 *      in the LLM prompt: it is deterministic, auditable, and cheap.
 *   3. **Counterparty name.** The other side is the account holder, however the
 *      bank happened to format the name.
 */

export type TransferSource = "reference" | "pattern" | "name";
export type TransferVerdict = { isTransfer: true; source: TransferSource };

/** Where a provider's own internal movements are worded. */
export interface ProviderPattern {
  /** Stable id, e.g. "opay". */
  provider: string;
  /** Human label for Settings. */
  label: string;
  /**
   * Phrases that mark a movement as this provider's internal sweep.
   *
   * Matched against a normalised description: whitespace collapsed and case
   * folded. Real statements put a space before the pipe — OPay emits
   * `"Mobile Data | ..."` — so these are never written with a literal `|`.
   */
  phrases: string[];
}

export const PROVIDER_PATTERNS: ProviderPattern[] = [
  {
    provider: "opay",
    label: "OPay / OWealth",
    phrases: [
      "auto-save to owealth",
      "auto save to owealth",
      "owealth withdrawal",
      "owealth transfer",
      "owealth auto-save",
    ],
  },
];

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Lower-cased phrase set per provider, built once. */
const COMPILED_PROVIDER_PHRASES = PROVIDER_PATTERNS.map((pattern) => ({
  provider: pattern.provider,
  phrases: pattern.phrases.map(normalise),
}));

/**
 * A row the provider itself flags as internal movement.
 *
 * "OWealth Interest Earned" is deliberately absent: interest is income, and a
 * pattern list that swept it up would quietly delete it from the user's income.
 */
export function matchesProviderPattern(description: string): TransferSource | null {
  const text = normalise(description);
  for (const entry of COMPILED_PROVIDER_PHRASES) {
    if (entry.phrases.some((phrase) => text.includes(phrase))) return "pattern";
  }
  return null;
}

/**
 * Words that are never part of a person's name. Without this, "Transfer from
 * Onah, EMMANUEL CHINONSO" tokenises to {onah, emmanuel, chinonso} and the
 * institution or the masked account number leaks into the comparison.
 */
const NAME_NOISE = new Set(["transfer", "from", "to", "bank", "mobile", "ussd", "payment", "trf", "ng", "ltd", "limited"]);

/** Lower-cased alphabetic tokens, noise removed. */
export function nameTokens(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[a-z]+/g) ?? [])
      // Strip a single leading initial ("c chukwubikem" style) by keeping tokens
      // of two or more characters plus single letters that are not noise.
      .filter((token) => token.length > 1 || !NAME_NOISE.has(token))
      .filter((token) => !NAME_NOISE.has(token)),
  );
}

/**
 * True when `counterparty` is the account holder.
 *
 * Order- and case-insensitive by token set, and tolerant of a subset: banks
 * truncate names inconsistently ("Onah, EMMANUEL CHINONSO" against a profile
 * holding "CHINONSO EMMANUEL Onah"). A subset match is deliberate but is only
 * trusted above a minimum size, so a one-word counterparty cannot match on a
 * single shared token.
 */
export function isAccountHolder(counterparty: string, holderNames: string[]): boolean {
  const counterpartyTokens = nameTokens(counterparty);
  if (counterpartyTokens.size === 0) return false;
  for (const holder of holderNames) {
    const holderTokens = nameTokens(holder);
    if (holderTokens.size === 0) continue;
    const shared = [...counterpartyTokens].filter((token) => holderTokens.has(token));
    if (shared.length === counterpartyTokens.size && counterpartyTokens.size >= 2) return true;
  }
  return false;
}

/**
 * Pulls the counterparty out of a bank narration.
 *
 * OPay (and several Nigerian banks) format transfers as
 * `Transfer from <name> | <bank> | <account> | <purpose>`, where the fields are
 * pipe-separated. That delimiter is meaningful, so the counterparty is field
 * one rather than a regex guess — and the purpose is the tail, which is where a
 * word like "loan" actually lives.
 */
export interface ParsedNarration {
  direction: "in" | "out" | null;
  counterparty: string | null;
  institution: string | null;
  /** Everything after the account field: the human-written part. */
  purpose: string | null;
}

const DIRECTION = /^Transfer\s+(from|to)\s+([^|]+?)(?:\s*\|(.*))?$/i;

export function parseTransferNarration(description: string): ParsedNarration {
  const match = DIRECTION.exec(description.trim());
  if (!match) return { direction: null, counterparty: null, institution: null, purpose: null };

  const direction = match[1]!.toLowerCase() === "from" ? "in" : "out";
  const counterparty = match[2]!.trim();
  const rest = (match[3] ?? "").split("|").map((part) => part.trim());

  // [bank, account, ...purpose]
  const institution = rest[0] ?? null;
  const account = rest[1] ?? null;
  const purposeParts = rest.slice(2).filter(Boolean);
  // Some narrations put the purpose in the first field ("Borrow/loan to ...").
  const purpose = purposeParts.length > 0 ? purposeParts.join(" | ") : account && !/\*{2}/.test(account) ? account : null;

  return { direction, counterparty: counterparty || null, institution, purpose };
}

/**
 * Narration that names a loan, and therefore suggests a loan receipt rather
 * than income. Only meaningful on an inflow — a loan repayment is a transfer.
 */
export function mentionsLoan(text: string): boolean {
  return /\b(loan|borrow(ing|ed)?|advance)\b/i.test(text);
}

/** Numeric coercion that treats a blank cell as absent, not as zero. */
function numberOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Which way money moved, from whichever columns the statement supplied. */
function sideOf(row: { debit?: unknown; credit?: unknown; amount?: unknown }): "in" | "out" | null {
  const debit = numberOrNull(row.debit);
  if (debit !== null && debit !== 0) return "out";
  const credit = numberOrNull(row.credit);
  if (credit !== null && credit !== 0) return "in";
  const amount = numberOrNull(row.amount);
  if (amount !== null && amount !== 0) return amount > 0 ? "in" : "out";
  return null;
}

export type PairableRow = {
  reference?: string | null;
  subAccount?: string | null;
  debit?: unknown;
  credit?: unknown;
  amount?: unknown;
};

/**
 * Pairs rows by bank reference across the sections of one document.
 *
 * Two rows sharing a reference are only two halves of one movement when three
 * things hold, and all three are checked:
 *
 *   1. **Exactly two rows.** Three or more on one reference is a batch the bank
 *      split; pairing any two of them would be a guess.
 *   2. **Opposite sides.** One debit and one credit. Two debits that happen to
 *      share a reference are two separate payments, and marking both as one
 *      movement would delete a real expense from the ledger.
 *   3. **Two different sections.** This is what makes it *a transfer* rather
 *      than a double-printed row. When both rows declare a section they must
 *      differ; a duplicate line inside one account is a printing artefact, not
 *      money moving between pockets.
 *
 * Comparison is on the reference string exactly — no normalisation — because the
 * pairing is only meaningful when the bank itself says these are the same
 * transaction.
 */
export function pairByReference<T extends PairableRow>(rows: T[]): Map<T, TransferSource> {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.reference) continue;
    const reference = row.reference;
    const bucket = buckets.get(reference) ?? [];
    bucket.push(row);
    buckets.set(reference, bucket);
  }

  const paired = new Map<T, TransferSource>();
  for (const bucket of buckets.values()) {
    if (bucket.length !== 2) continue;
    const [first, second] = bucket as [T, T];
    if (sideOf(first) === sideOf(second)) continue;
    const firstSection = first.subAccount?.trim();
    const secondSection = second.subAccount?.trim();
    if (firstSection && secondSection && firstSection.toLowerCase() === secondSection.toLowerCase()) continue;
    paired.set(first, "reference");
    paired.set(second, "reference");
  }
  return paired;
}

/**
 * Full verdict for one row, given the document's rows and the names that belong
 * to the account holder.
 */
export function detectTransfer<T extends PairableRow & { description: string }>(
  row: T,
  allRows: T[],
  holderNames: string[],
): TransferVerdict | null {
  const byReference = pairByReference(allRows);
  const paired = byReference.get(row);
  if (paired) return { isTransfer: true, source: "reference" };

  if (matchesProviderPattern(row.description)) return { isTransfer: true, source: "pattern" };

  const narration = parseTransferNarration(row.description);
  if (narration.counterparty && isAccountHolder(narration.counterparty, holderNames)) {
    return { isTransfer: true, source: "name" };
  }

  return null;
}