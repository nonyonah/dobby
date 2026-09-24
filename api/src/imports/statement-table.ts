export type StatementRow = {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  page: number;
  currency?: string;
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

function htmlTables(text: string): TableRows[] {
  const tables = [...text.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  return tables.map((table) => [...(table[1] ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...(row[1] ?? "").matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decodeEntities((cell[1] ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()),
  ));
}

function markdownTables(text: string): TableRows[] {
  const rows: TableRows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.includes("|") || /^\|?\s*:?-{2,}/.test(trimmed)) continue;
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (cells.length > 1) rows.push(cells);
  }
  return rows.length ? [rows] : [];
}

function delimitedTables(text: string): TableRows[] {
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.includes("\t")).map((line) => line.split("\t").map((cell) => cell.trim()));
  return rows.length ? [rows] : [];
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
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

function parseTable(rows: TableRows, page: number): StatementRow[] {
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
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) return [];

  return rows.slice(headerRowIndex + 1).flatMap((row) => {
    const cells = row.map((cell) => (cell ?? "").trim());
    const dateText = cells[dateIndex] ?? "";
    const date = parseDateCell(dateText);
    const description = cells[descriptionIndex]?.trim() ?? "";
    if (!date || !description || /^total\b/i.test(description)) return [];

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
    if (amount === undefined || amount === 0) return [];
    const balance = balanceIndex >= 0 ? parseAmountCell(cells[balanceIndex]) : undefined;
    const currency = currencyFromRow(cells, headers.join(" "));
    return [{ date, description, amount, ...(balance !== undefined ? { balance } : {}), page, ...(currency ? { currency } : {}) }];
  });
}

export function parseStatementTable(text: string, page: number): StatementRow[] {
  const tables = [...htmlTables(text), ...markdownTables(text), ...delimitedTables(text)];
  const transactions = tables.flatMap((table) => parseTable(table, page));
  const seen = new Set<string>();
  return transactions.filter((transaction) => {
    const key = [transaction.date, transaction.description, transaction.amount, transaction.balance ?? ""].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
