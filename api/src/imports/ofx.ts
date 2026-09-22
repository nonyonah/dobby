export type ParsedStatementTransaction = { externalId?: string; occurredAt: Date; amount: number; description: string; type: "INCOME" | "EXPENSE" };

function tag(text: string, name: string) {
  const match = text.match(new RegExp(`<${name}(?:>[^<\\r\\n]*|>[^<]*)`, "i"));
  return match?.[0]?.replace(new RegExp(`^<${name}>`, "i"), "").trim();
}

export function parseOfxQfx(text: string): ParsedStatementTransaction[] {
  // OFX 1.x/QFX files commonly use SGML without closing tags; splitting on
  // STMTTRN therefore handles both SGML and XML exports.
  const rows = text.split(/<STMTTRN>/i).slice(1);
  return rows.flatMap((row) => {
    const amount = Number((tag(row, "TRNAMT") ?? "").replace(/,/g, ""));
    const rawDate = tag(row, "DTPOSTED")?.slice(0, 8);
    const occurredAt = rawDate ? new Date(`${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T12:00:00Z`) : new Date(NaN);
    const description = tag(row, "NAME") ?? tag(row, "MEMO") ?? "Imported statement transaction";
    if (!Number.isFinite(amount) || Number.isNaN(occurredAt.getTime())) return [];
    return [{ externalId: tag(row, "FITID"), occurredAt, amount: Math.abs(amount), description, type: amount >= 0 ? "INCOME" : "EXPENSE" }];
  });
}
