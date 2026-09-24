export interface CategoryRef {
  id: string;
  name: string;
}

export interface RuleRef {
  matcher: string;
  categoryId: string;
}

export type SuggestMethod = "rule" | "keyword";

/**
 * Canonical intent -> match keywords. Includes the Nigeria pack: most
 * bank-transfer narratives are vague, but telco/power tokens are reliable
 * (glo, mtn, airtime, data, electricity, discos, dstv/gotv).
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  groceries: ["grocery", "groceries", "supermarket", "whole foods", "shoprite", "spar"],
  housing: ["rent", "mortgage", "housing", "landlord", "service charge"],
  utilities: [
    "electric",
    "electricity",
    "water",
    "internet",
    "utility",
    "utilities",
    "power",
    "phone bill",
    "airtime",
    "data bundle",
    "data",
    "glo",
    "mtn",
    "airtel",
    "9mobile",
    "etisalat",
    "ikeja electric",
    "eko electricity",
    "ibadan electric",
    "phed",
    "kedco",
    "aedc",
    "eedc",
    "jedc",
    "dstv",
    "gotv",
    "startimes",
  ],
  transport: ["uber", "bolt", "lyft", "fuel", "gas station", "transport", "airline", "flight", "danfo", "keke"],
  dining: ["restaurant", "cafe", "coffee", "dining", "pizza", "food delivery", "jumia food", "chicken republic", "kilimanjaro"],
  shopping: ["amazon", "shop", "store", "purchase", "mall", "jumia", "konga"],
  education: ["school", "course", "tuition", "education", "udemy", "coursera"],
  income: ["salary", "payroll", "payday", "wage", "freelance", "invoice", "payout"],
  investments: ["invest", "dividend", "interest", "brokerage", "stocks", "treasury", "tbill"],
};

/**
 * Canonical intent -> fragments matched against the user's own category
 * names, so custom names ("Bills", "Feeding", "Side hustle") still get
 * keyword coverage instead of only exact-name matches.
 */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  groceries: ["grocer", "food", "feeding", "supermarket", "market"],
  housing: ["hous", "rent", "mortgage", "accommodation", "shelter"],
  utilities: ["utilit", "bill", "power", "electric", "airtime", "data", "subscrip"],
  transport: ["transport", "travel", "commute", "movement", "fuel"],
  dining: ["din", "restaurant", "food", "eatery", "meal"],
  shopping: ["shop", "store", "purchase", "retail"],
  education: ["educa", "school", "learn", "course", "tuition"],
  income: ["income", "salary", "earning", "revenue", "pay"],
  investments: ["invest", "saving", "dividend", "interest"],
};

function keywordPattern(keyword: string): RegExp {
  // Short tokens (glo, mtn, data) must match whole words to avoid
  // false positives like "global" or "metadata".
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^[a-z0-9]{1,4}$/.test(keyword)) return new RegExp(`\\b${escaped}\\b`, "i");
  return new RegExp(escaped.replace(/ /g, "\\s+"), "i");
}

const patternCache = new Map<string, RegExp>();
function matchesKeyword(descriptor: string, keyword: string): boolean {
  let pattern = patternCache.get(keyword);
  if (!pattern) {
    pattern = keywordPattern(keyword);
    patternCache.set(keyword, pattern);
  }
  pattern.lastIndex = 0;
  return pattern.test(descriptor);
}

function resolveCategory(canonical: string, categories: CategoryRef[]): CategoryRef | undefined {
  const direct = categories.find((category) => category.name.toLowerCase().includes(canonical));
  if (direct) return direct;
  const aliases = CATEGORY_ALIASES[canonical] ?? [];
  return categories.find((category) => {
    const name = category.name.toLowerCase();
    return aliases.some((alias) => name.includes(alias));
  });
}

export function suggestCategory(
  descriptor: string,
  type: string,
  categories: CategoryRef[],
  rules: RuleRef[],
): { categoryId: string; method: SuggestMethod } | null {
  const normalized = descriptor.toLowerCase();
  const rule = rules.find((item) => normalized.includes(item.matcher.toLowerCase()) && item.categoryId);
  if (rule?.categoryId) return { categoryId: rule.categoryId, method: "rule" };
  for (const [canonical, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!keywords.some((keyword) => matchesKeyword(descriptor, keyword))) continue;
    if (type === "INCOME" && canonical !== "income") continue;
    if (type !== "INCOME" && canonical === "income") continue;
    const category = resolveCategory(canonical, categories);
    if (category) return { categoryId: category.id, method: "keyword" };
  }
  if (type === "INCOME") {
    const income = categories.find((category) => category.name.toLowerCase().includes("income"));
    if (income) return { categoryId: income.id, method: "keyword" };
  }
  return null;
}
