/**
 * Deterministic bank-alert pre-parser. Runs before the Gemini fallback in
 * `sync.ts`: free, instant, and exact on the grammars below. Returns
 * `undefined` whenever the text is ambiguous — the caller then tries the LLM.
 *
 * Verified grammar (GTBank / ALAT style):
 *   Acct: ******2342 Amt: NGN1,440.00 DR Desc: Transfer to … Avail Bal: NGN754.04
 *   Acct: 0228895607 Amt: 265,000.00 CR Desc: … Avail Bal: 425,102.41
 */

export type ParsedAlert = {
  type: "INCOME" | "EXPENSE";
  amount: number;
  currency?: string;
  description: string;
};

const GTB_ALERT =
  /Acct:\s*\*+\s*(\d{4,})\s+Amt:\s*([A-Za-z]{3})?\s*([\d,]+\.\d{2})\s+(DR|CR)\b\s*(?:Desc:\s*(.+?))?(?:\s+Avail\s*Bal:|$)/i;

const AMOUNT = /(?:Amt|Amount|Sum|Value|Total)\s*:?\s*([A-Za-z]{3})?\s*([₦$£€₵]?)\s*([\d,]+(?:\.\d{1,2})?)/i;
const BALANCE_LINE = /(?:Avail(?:able)?\s*Bal(?:ance)?|Balance|Bal)\s*:?\s*[₦$£€₵]?\s*[\d,]+(?:\.\d{1,2})?/i;
const DESC_CAPTURE = /(?:Desc|Description|Narration|Details|Remarks|Particulars)\s*:?\s*(.+)/i;
const CREDIT_HINT = /\b(CR|CREDIT|CREDITED|DEPOSIT|DEPOSITED|RECEIVED|REFUND|FUNDS RECEIVED)\b/i;
const DEBIT_HINT = /\b(DR|DEBIT|DEBITED|WITHDRAWN|WITHDRAWAL|PAID|PAYMENT|PURCHASE|CHARGE|SENT|TRANSFERRED)\b/i;

const SYMBOL_CURRENCY: Record<string, string> = { "₦": "NGN", $: "USD", "£": "GBP", "€": "EUR", "₵": "GHS" };

function cleanAmount(raw: string): number | undefined {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function cleanDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cut = raw.split(BALANCE_LINE)[0] ?? "";
  const text = cut.replace(/\s+/g, " ").trim().slice(0, 200);
  return text.length >= 3 ? text : undefined;
}

export function preparsedAlert(input: { subject?: string | null; from?: string | null; body?: string | null }): ParsedAlert | undefined {
  const text = `${input.subject ?? ""}\n${input.body ?? ""}`.slice(0, 6000);

  const gtb = GTB_ALERT.exec(text);
  if (gtb) {
    const amount = cleanAmount(gtb[3] ?? "");
    const description = cleanDescription(gtb[5]);
    if (!amount || !description) return undefined;
    return {
      type: (gtb[4] ?? "").toUpperCase() === "CR" ? "INCOME" : "EXPENSE",
      amount,
      ...(gtb[2] ? { currency: gtb[2].toUpperCase() } : {}),
      description,
    };
  }

  const amountMatch = AMOUNT.exec(text);
  if (!amountMatch) return undefined;
  const amount = cleanAmount(amountMatch[3] ?? "");
  if (!amount) return undefined;
  const currency = (amountMatch[1] ? amountMatch[1].toUpperCase() : undefined) ?? (amountMatch[2] ? SYMBOL_CURRENCY[amountMatch[2]] : undefined);

  // Direction from the amount's own line first, then the whole text.
  const amountLine = text.slice(Math.max(0, (amountMatch.index ?? 0) - 40), (amountMatch.index ?? 0) + amountMatch[0].length + 40);
  const scope = `${amountLine}\n${text}`;
  const credit = CREDIT_HINT.test(scope);
  const debit = DEBIT_HINT.test(scope);
  if (credit === debit) return undefined; // both or neither — ambiguous, let the LLM decide

  const descMatch = DESC_CAPTURE.exec(text);
  const description = cleanDescription(descMatch?.[1]);
  if (!description) return undefined;

  return { type: credit ? "INCOME" : "EXPENSE", amount, ...(currency ? { currency } : {}), description };
}
