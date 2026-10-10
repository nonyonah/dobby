export type StatementRow = {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  page: number;
  currency?: string;
  /**
   * The account section this row was parsed under, e.g. "Wallet".
   *
   * Multi-account statements print one table per account, and treating them as
   * one ledger silently merges balances the user never held together. A document
   * with no detectable headings leaves this undefined rather than guessing.
   */
  subAccount?: string;
  /**
   * Bank reference, kept as a string.
   *
   * Never a number: roughly a quarter of the references in the tested statement
   * begin with `0`, and `Number()` would drop that digit — which is enough to
   * break the pairing that identifies a transfer as two halves of one movement.
   */
  reference?: string;
  /** Positive magnitudes, kept alongside the signed amount so totals reconcile. */
  debit?: number;
  credit?: number;
};

type TableCell = string | null;
type TableRows = TableCell[][];

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/**
 * A table, plus the account heading it was printed under.
 *
 * The heading lives in the document body, not inside the table, so the section
 * has to be carried in from the line scan — a parser that only saw the table
 * would merge two accounts into one ledger.
 */
type TableBlock = { rows: TableRows; section?: string };

function htmlTables(text: string): TableBlock[] {
  const blocks: TableBlock[] = [];
  let section: string | undefined;
  let cursor = 0;
  for (const table of text.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    // Whatever heading text precedes this table names the account it belongs to.
    const before = text.slice(cursor, table.index ?? 0);
    const lastHeading = before
      .split(/\r?\n/)
      .map((line) => line.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter((line) => line && line.length <= 40)
      .filter(looksLikeSectionLabel)
      .pop();
    if (lastHeading) section = lastHeading;
    const rows = [...(table[1] ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...(row[1] ?? "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decodeEntities((cell[1] ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()),
    );
    if (rows.length) blocks.push({ rows, ...(section ? { section } : {}) });
    cursor = (table.index ?? 0) + table[0].length;
  }
  return blocks;
}

/**
 * Splits a row on its *unescaped* pipes and unescapes the rest.
 *
 * The PDF extractor escapes a literal pipe inside a cell as `\|`, so that a
 * description such as `Transfer from Onah | Kuda MFB | 200****751` survives the
 * table round-trip. Splitting on every pipe — which is what this used to do —
 * tore those rows into extra columns: the reference and the amounts ended up in
 * the wrong cells and the row was then discarded as unparseable. That silently
 * dropped the bank's own transfer narrations, which are exactly the rows
 * transfer detection needs to read.
 */
function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === "\\" && line[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function markdownTables(text: string): TableBlock[] {
  const blocks: TableBlock[] = [];
  let current: TableRows = [];
  let section: string | undefined;
  const flush = () => {
    if (current.length) blocks.push({ rows: current, ...(section ? { section } : {}) });
    current = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.includes("|")) {
      // A bare account heading ends the previous table and names the next one.
      const heading = trimmed.replace(/\s*[:|-]\s*$/, "").trim();
      if (looksLikeSectionLabel(heading)) {
        flush();
        section = heading;
      }
      continue;
    }
    if (/^\|?\s*:?-{2,}/.test(trimmed)) continue;
    const cells = splitTableRow(trimmed.replace(/^\|/, "").replace(/\|$/, "")).map((cell) => cell.trim());
    if (cells.length > 1) current.push(cells);
  }
  flush();
  return blocks;
}

function delimitedTables(text: string): TableBlock[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("\t"))
    .map((line) => line.split("\t").map((cell) => cell.trim()));
  return rows.length ? [{ rows }] : [];
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Words a bank uses to head an account section.
 *
 * A date-less row inside a transaction table is ambiguous by nature: it is
 * either a new account heading or the tail of a description that wrapped onto
 * the next line. Guessing "section" for a wrapped line loses a transaction's
 * description; guessing "continuation" for a heading silently merges two
 * accounts into one.
 *
 * So the decision is made in favour of continuation — appending is lossless,
 * whereas a wrong section split is not — and a row is only read as a heading
 * when it actually looks like one. An unrecognised heading degrades to a
 * single-section statement, which the checksum then catches.
 */
const SECTION_WORD = /^(wallet|savings?|current|dormant|loan|investment|oreach|owealth|domiciliary|account|balance|transaction)\b/i;

function looksLikeSectionLabel(value: string): boolean {
  const text = value.trim();
  if (!text || text.length > 40) return false;
  // A row of digits is data, not a heading.
  if (/\d/.test(text)) return false;
  if (/[|,;]/.test(text)) return false;
  return SECTION_WORD.test(text);
}

/** A date-less row carrying only text, which is how both headings and wraps arrive. */
function isContinuationCandidate(row: TableCell[]): boolean {
  const filled = row.filter((cell) => (cell ?? "").trim().length > 0);
  return filled.length === 1;
}

function findIndex(headers: string[], patterns: RegExp[]) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalizeHeader(header))));
}

function parseDateCell(value: string) {
  const text = value.trim();
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const [, year, month, day] = iso;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    let month: number;
    let day: number;
    if (first > 12) { day = first; month = second; }
    else if (second > 12) { month = first; day = second; }
    else { day = first; month = second; }
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parseAmountCell(value: string | undefined): number | undefined {
  if (!value?.trim() || /^[-—–]$/.test(value.trim())) return undefined;
  const text = value.trim();
  const negative = /^\s*\(/.test(text) || /\bDR\b/i.test(text) || /^\s*-/.test(text);
  const numberText = text.replace(/[()]/g, "").replace(/\b(?:CR|DR)\b/gi, "").replace(/[^\d.,-]/g, "");
  let normalized = numberText;
  if (normalized.includes(",") && normalized.includes(".")) normalized = normalized.replace(/,/g, "");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) normalized = normalized.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(normalized)) normalized = normalized.replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return undefined;
  return negative ? -Math.abs(amount) : Math.abs(amount);
}

function currencyFromRow(cells: string[], header: string) {
  const value = `${header} ${cells.join(" ")}`.toUpperCase();
  if (value.includes("₦") || /\bNGN\b/.test(value)) return "NGN";
  if (value.includes("$") || /\bUSD\b/.test(value)) return "USD";
  if (value.includes("£") || /\bGBP\b/.test(value)) return "GBP";
  if (value.includes("€") || /\bEUR\b/.test(value)) return "EUR";
  if (value.includes("GH₵") || /\bGHS\b/.test(value)) return "GHS";
  if (/\bKES\b/.test(value)) return "KES";
  return undefined;
}

function parseTable(rows: TableRows, page: number, sectionHeading?: string): StatementRow[] {
  if (rows.length < 2) return [];
  const headerRowIndex = rows.findIndex((row) => {
    const headers = row.map((cell) => cell ?? "");
    return findIndex(headers, [/date/]) >= 0 &&
      findIndex(headers, [/description/, /details/, /narration/, /particulars/, /payee/, /merchant/, /reference/, /remarks/]) >= 0;
  });
  if (headerRowIndex < 0) return [];

  const headers = rows[headerRowIndex]!.map((cell) => cell ?? "");
  const dateIndex = findIndex(headers, [/date/]);
  const descriptionIndex = findIndex(headers, [/description/, /details/, /narration/, /particulars/, /payee/, /merchant/, /reference/, /remarks/]);
  const amountIndex = findIndex(headers, [/amount/, /transactionamount/, /^value$/]);
  const debitIndex = findIndex(headers, [/debit/, /withdrawal/, /moneyout/, /paidout/]);
  const creditIndex = findIndex(headers, [/credit/, /deposit/, /moneyin/, /paidin/]);
  const balanceIndex = findIndex(headers, [/balance/]);
  const directionIndex = findIndex(headers, [/^type$/, /debitcredit/, /drcr/]);
  // Only taken when it is a column of its own. "Reference" is already one of
  // the words that can *be* the description column, so pointing both at the
  // same cell would take the narrative for its own identifier.
  const referenceIndex = (() => {
    const index = findIndex(headers, [/^(ref|reference|references|referenceNo|transactionId|txnref|narrationId|entryReference)$/]);
    return index >= 0 && index !== descriptionIndex ? index : -1;
  })();
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) return [];

  const transactions: StatementRow[] = [];
  let currentSection: string | undefined = sectionHeading;
  let pendingWrap: StatementRow | null = null;

  for (const row of rows.slice(headerRowIndex + 1)) {
    const cells = row.map((cell) => (cell ?? "").trim());
    const dateText = cells[dateIndex] ?? "";
    const date = parseDateCell(dateText);
    const description = cells[descriptionIndex]?.trim() ?? "";

    // A wrapped description: the date never arrives, so the line is appended to
    // the row above rather than dropped. OPay wraps its longest narrations —
    // "Transfer from ... | ... | ..." — across lines, and dropping the tail
    // loses the counterparty name that transfer detection reads.
    //
    // The text is read from whichever cell carries it: a wrapped line is
    // aligned under the description column in some layouts and flush left in
    // others, and demanding the description column silently loses the second
    // kind.
    if (!date && isContinuationCandidate(row)) {
      const continuationText = cells.find((cell) => cell.length > 0) ?? "";
      if (continuationText) {
        if (looksLikeSectionLabel(continuationText)) {
          currentSection = continuationText;
          pendingWrap = null;
          continue;
        }
        if (pendingWrap) {
          pendingWrap.description = `${pendingWrap.description} ${continuationText}`.replace(/\s+/g, " ").trim();
          continue;
        }
      }
    }
    if (!date || !description || /^total\b/i.test(description)) continue;

    const debit = debitIndex >= 0 ? parseAmountCell(cells[debitIndex]) : undefined;
    const credit = creditIndex >= 0 ? parseAmountCell(cells[creditIndex]) : undefined;
    let amount: number | undefined;
    if (debit !== undefined || credit !== undefined) {
      amount = debit !== undefined && debit !== 0 ? -Math.abs(debit) : credit !== undefined ? Math.abs(credit) : undefined;
    } else {
      amount = parseAmountCell(cells[amountIndex]);
      const direction = directionIndex >= 0 ? cells[directionIndex]?.toLowerCase() ?? "" : "";
      if (amount !== undefined && /debit|withdraw|\bdr\b/.test(direction)) amount = -Math.abs(amount);
      if (amount !== undefined && /credit|deposit|\bcr\b/.test(direction)) amount = Math.abs(amount);
    }
    if (amount === undefined || amount === 0) continue;

    const balance = balanceIndex >= 0 ? parseAmountCell(cells[balanceIndex]) : undefined;
    const currency = currencyFromRow(cells, headers.join(" "));
    // Kept as a trimmed string and stripped of the formatting a bank wraps
    // around it — a reference must match the *same* reference on the other leg.
    const reference = referenceIndex >= 0 ? cells[referenceIndex]?.replace(/\s+/g, "") : undefined;

    pendingWrap = {
      date,
      description,
      amount,
      ...(balance !== undefined ? { balance } : {}),
      page,
      ...(currency ? { currency } : {}),
      ...(currentSection ? { subAccount: currentSection } : {}),
      ...(reference ? { reference } : {}),
      ...(debit !== undefined && debit !== 0 ? { debit: Math.abs(debit) } : {}),
      ...(credit !== undefined && credit !== 0 ? { credit: Math.abs(credit) } : {}),
    };
    transactions.push(pendingWrap);
  }

  return transactions;
}

export function parseStatementTable(text: string, page: number): StatementRow[] {
  const tables = [...htmlTables(text), ...markdownTables(text), ...delimitedTables(text)];
  const transactions = tables.flatMap((table) => parseTable(table.rows, page, table.section));
  const seen = new Set<string>();
  return transactions.filter((transaction) => {
    const key = [transaction.date, transaction.description, transaction.amount, transaction.balance ?? ""].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The totals a statement declares about itself.
 *
 * Extracted from the raw text rather than from the parsed rows, deliberately:
 * these numbers are the independent check. Deriving them from the rows would
 * make the checksum compare the rows against themselves, which always passes.
 */
export type DeclaredSummary = {
  subAccount: string;
  openingBalance: number | null;
  totalDebit: number | null;
  totalCredit: number | null;
  closingBalance: number | null;
  declaredRowCount: number | null;
};

const TOTAL_LABEL: Array<{ field: keyof DeclaredSummary; pattern: RegExp }> = [
  { field: "openingBalance", pattern: /^(opening|opening\s+balance|opening\s+bal|balance\s+bfd|b\/f|brought\s+forward)\b/i },
  { field: "closingBalance", pattern: /^(closing|closing\s+balance|closing\s+bal|balance\s+c\/f|c\/f|carried\s+forward|balance)\b/i },
  { field: "totalDebit", pattern: /^(total\s+debit|total\s+debits|total\s+out|total\s+withdrawal|total\s+debit\s+amount)\b/i },
  { field: "totalCredit", pattern: /^(total\s+credit|total\s+credits|total\s+in|total\s+deposit|total\s+credit\s+amount)\b/i },
];

/**
 * "Total: 1,234.56", "Total Debit - N4,324.60", "Total Debit NGN 4,324.60".
 *
 * The label and the figure are frequently separated by a dash, a colon, several
 * spaces or a currency code, and the label itself is sometimes wrapped across
 * two lines ("Total Debit" / "4,324.60"). Matching is therefore label-then-value
 * with a bounded gap, never one rigid pattern.
 */
const MONEY = String.raw`[₦$£€]?\s*(?:NGN|USD|GBP|EUR|GHS|KES)?\s*-?\s*[\d][\d,\s]*(?:\.\d{1,2})?`;

function parseMoney(text: string): number | null {
  const match = new RegExp(MONEY, "i").exec(text);
  if (!match) return null;
  let digits = match[0].replace(/[^\d.,-]/g, "").replace(/\s+/g, "");
  if (digits.includes(",") && digits.includes(".")) digits = digits.replace(/,/g, "");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(digits)) digits = digits.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(digits)) digits = digits.replace(",", ".");
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

/**
 * Reads the declared totals out of a statement, per account section.
 *
 * A statement that prints one summary block per account attributes each block
 * to the heading above it. A single-account statement has no headings, and its
 * totals are attributed to a single section so the checksum still has something
 * to compare against.
 */
export function parseDeclaredSummaries(text: string): DeclaredSummary[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const summaries: DeclaredSummary[] = [];
  let current: DeclaredSummary | null = null;

  const blank = (): DeclaredSummary => ({
    subAccount: "Account",
    openingBalance: null,
    totalDebit: null,
    totalCredit: null,
    closingBalance: null,
    declaredRowCount: null,
  });

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line) continue;

    // A lone label with no figures is an account heading when it names one.
    if (isContinuationLike(line) && looksLikeSectionLabel(line)) {
      current = { ...blank(), subAccount: line };
      summaries.push(current);
      continue;
    }

    for (const { field, pattern } of TOTAL_LABEL) {
      if (!pattern.test(line)) continue;
      // The figure may sit on the same line or on the next one.
      const value = parseMoney(line.slice(pattern.exec(line)![0].length)) ?? parseMoney(lines[index + 1] ?? "");
      if (field === "totalDebit" || field === "totalCredit" || field === "openingBalance" || field === "closingBalance") {
        if (value === null) continue;
        if (!current) {
          current = blank();
          summaries.push(current);
        }
        (current as unknown as Record<string, number>)[field] = Math.abs(value);
      }
    }

    const count = line.match(/^(?:no\.?\s*of\s*transactions|number\s+of\s+transactions|transaction\s+count|total\s+transactions|entries)\s*[:\-]?\s*(\d[\d,]*)/i);
    if (count) {
      if (!current) {
        current = blank();
        summaries.push(current);
      }
      current.declaredRowCount = Number(count[1]!.replace(/,/g, ""));
    }
  }

  return summaries;
}

/** A line that is a bare label with no figures on it. */
function isContinuationLike(line: string): boolean {
  return !/\d/.test(line) && !/[|,;]/.test(line);
}

