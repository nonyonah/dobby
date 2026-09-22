export type ParsedStatementTransaction = { externalId?: string; occurredAt: Date; amount: number; description: string; type: "INCOME" | "EXPENSE" };

function tag(text: string, name: string) { return text.match(new RegExp(`<${name}>([^<\\r\\n]+)`, "i"))?.[1]?.trim(); }

export function parseOfxQfx(text: string): ParsedStatementTransaction[] {
  const normalized = text.replace(/<\/?OFX[^>]*>/gi, "");
  return [...normalized.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].flatMap((match) => {
    const row = match[1] ?? ""; const amount = Number((tag(row, "TRNAMT") ?? "").replace(/,/g, "")); const rawDate = tag(row, "DTPOSTED")?.slice(0, 8); const occurredAt = rawDate ? new Date(`${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T12:00:00Z`) : new Date(NaN); const description = tag(row, "NAME") ?? tag(row, "MEMO") ?? "Imported statement transaction";
    if (!Number.isFinite(amount) || Number.isNaN(occurredAt.getTime())) return [];
    return [{ externalId: tag(row, "FITID"), occurredAt, amount: Math.abs(amount), description, type: amount >= 0 ? "INCOME" : "EXPENSE" }];
  });
}
