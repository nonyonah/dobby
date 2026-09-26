/**
 * Seeds the global bank/merchant directory for the email importer.
 *
 * Sources (all keyless, verified 2026-09-26):
 * - Nigerian banks: GET https://api.paystack.co/bank?currency=NGN (cursor pages)
 * - US banks: FDIC BankFind bulk (ACTIVE:1, limit=10000 — one call)
 * Sender rules are seeded ONLY from first-party evidence (bank security pages
 * or real emails); everything else stays unverified or out of the table.
 *
 * Idempotent: banks upsert on (source, sourceId), rules upsert on
 * (bank|merchant, matchType, pattern). Safe to re-run.
 *
 * Usage: npx tsx prisma/seed-banks.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type PaystackBank = {
  id: number;
  name: string;
  slug: string;
  code: string;
  longcode: string;
  active: boolean;
  is_deleted: boolean | null;
};

type FdicInstitution = {
  NAME?: string;
  CERT?: number;
  CITY?: string;
  STALP?: string;
  WEBADDR?: string;
};

async function fetchPaystackBanks(): Promise<PaystackBank[]> {
  const all: PaystackBank[] = [];
  let next: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL("https://api.paystack.co/bank");
    url.searchParams.set("currency", "NGN");
    url.searchParams.set("perPage", "100");
    url.searchParams.set("use_cursor", "true");
    if (next) url.searchParams.set("next", next);
    const response = await fetch(url, { headers: { "user-agent": "dobby-seed/1.0" } });
    if (!response.ok) throw new Error(`Paystack /bank failed: HTTP ${response.status}`);
    const json = (await response.json()) as { data: PaystackBank[]; meta?: { next?: string | null } | null };
    all.push(...json.data);
    next = json.meta?.next ?? null;
    if (!next) break;
  }
  return all;
}

async function fetchFdicBanks(): Promise<FdicInstitution[]> {
  const url =
    "https://banks.data.fdic.gov/api/institutions?filters=ACTIVE:1&fields=NAME,CERT,CITY,STALP,WEBADDR&limit=10000&format=json";
  const response = await fetch(url, { headers: { "user-agent": "dobby-seed/1.0" } });
  if (!response.ok) throw new Error(`FDIC institutions failed: HTTP ${response.status}`);
  const json = (await response.json()) as { data: Array<{ data: FdicInstitution }> };
  return json.data.map((row) => row.data);
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "bank";

type BankRow = {
  country: string;
  name: string;
  slug: string | null;
  code: string | null;
  longcode: string | null;
  cert: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  active: boolean;
  source: string;
  sourceId: string;
};

/**
 * Bulk upsert in 250-row INSERTs: ~20 round trips for the whole directory
 * instead of 4,500 sequential upserts. Survives a flaky pooler far better.
 */
async function bulkUpsertBanks(rows: BankRow[]): Promise<void> {
  const cols = ["country", "name", "slug", "code", "longcode", "cert", "city", "state", "website", "active", "source", "sourceId"];
  const updates = [...cols, "updatedAt"].map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
  for (let offset = 0; offset < rows.length; offset += 250) {
    const chunk = rows.slice(offset, offset + 250);
    const values: string[] = [];
    const params: Array<string | boolean | null> = [];
    chunk.forEach((row, i) => {
      const base = i * cols.length;
      values.push(`(${cols.map((_, j) => `$${base + j + 1}`).join(", ")}, gen_random_uuid()::text, NOW(), NOW())`);
      params.push(row.country, row.name, row.slug, row.code, row.longcode, row.cert, row.city, row.state, row.website, row.active, row.source, row.sourceId);
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Bank" (${cols.map((c) => `"${c}"`).join(", ")}, "id", "createdAt", "updatedAt") VALUES ${values.join(", ")} ON CONFLICT ("source", "sourceId") DO UPDATE SET ${updates}`,
      ...params,
    );
    console.log(`  banks ${Math.min(offset + chunk.length, rows.length)}/${rows.length}`);
  }
}

/** Strip a leading www. so suffix matching also covers subdomains. */
const registrable = (host: string) => host.toLowerCase().replace(/^www\./, "");

async function seedBanks() {
  const [ng, us] = await Promise.all([fetchPaystackBanks(), fetchFdicBanks()]);
  console.log(`fetched ${ng.length} NG banks, ${us.length} US institutions`);

  const rows: BankRow[] = [
    ...ng.map((bank) => ({
      country: "NG",
      name: bank.name,
      slug: bank.slug,
      code: bank.code || null,
      longcode: bank.longcode || null,
      cert: null,
      city: null,
      state: null,
      website: null,
      active: bank.active && !bank.is_deleted,
      source: "paystack",
      sourceId: String(bank.id),
    })),
    ...us
      .filter((inst) => inst.NAME && inst.CERT !== undefined)
      .map((inst) => ({
        country: "US",
        name: inst.NAME as string,
        slug: slugify(inst.NAME as string),
        code: null,
        longcode: null,
        cert: String(inst.CERT),
        city: inst.CITY ?? null,
        state: inst.STALP ?? null,
        website: inst.WEBADDR?.trim() ? registrable(inst.WEBADDR.trim()) : null,
        active: true,
        source: "fdic",
        sourceId: String(inst.CERT),
      })),
  ];
  await bulkUpsertBanks(rows);
  console.log(`upserted ${rows.length} banks (${ng.length} NG source rows, ${us.length} US source rows)`);

  // Heritage Bank lost its CBN licence (June 2024, NDIC liquidation) and no
  // longer appears in Paystack's list — nothing to deactivate. If it ever
  // reappears, keep the row for matching old emails but mark it inactive.
  const heritage = await prisma.bank.updateMany({
    where: { country: "NG", name: { contains: "Heritage", mode: "insensitive" } },
    data: { active: false },
  });
  console.log(`heritage deactivated: ${heritage.count}`);
}

type Rule = { needles: string[]; matchType: "exact" | "domain"; pattern: string; verified: boolean };

/** Verified NG sender rules: exact addresses or domains with first-party evidence. */
const NG_SENDER_RULES: Rule[] = [
  { needles: ["kuda"], matchType: "exact", pattern: "no-reply@kuda.com", verified: true },
  { needles: ["kuda"], matchType: "domain", pattern: "kuda.com", verified: true },
  { needles: ["paga"], matchType: "exact", pattern: "service@mypaga.com", verified: true },
  { needles: ["paga"], matchType: "exact", pattern: "noreply@mypaga.com", verified: true },
  { needles: ["paga"], matchType: "domain", pattern: "mypaga.com", verified: true },
  { needles: ["opay"], matchType: "exact", pattern: "no-reply@opay-nigeria.com", verified: true },
  { needles: ["opay"], matchType: "domain", pattern: "opay-inc.com", verified: true },
  { needles: ["palmpay", "palm pay"], matchType: "domain", pattern: "palmpay.com", verified: true },
  { needles: ["palmpay", "palm pay"], matchType: "domain", pattern: "palmpay.co", verified: true },
  { needles: ["moniepoint", "monie point"], matchType: "domain", pattern: "moniepoint.com", verified: true },
  { needles: ["guaranty", "gtbank", "gt bank"], matchType: "domain", pattern: "gtbank.com", verified: true },
  { needles: ["zenith"], matchType: "domain", pattern: "zenithbank.com", verified: true },
  { needles: ["united bank", "uba"], matchType: "domain", pattern: "ubagroup.com", verified: true },
  { needles: ["access bank", "accessbank"], matchType: "domain", pattern: "accessbankplc.com", verified: true },
  { needles: ["first bank", "firstbank"], matchType: "domain", pattern: "firstbanknigeria.com", verified: true },
  { needles: ["first bank", "firstbank"], matchType: "domain", pattern: "firstbankgroup.com", verified: true },
  { needles: ["sterling"], matchType: "domain", pattern: "sterling.ng", verified: true },
  { needles: ["fidelity bank", "fidelitybank"], matchType: "domain", pattern: "fidelitybank.ng", verified: true },
  { needles: ["union bank", "unionbank"], matchType: "domain", pattern: "unionbankng.com", verified: true },
  { needles: ["wema", "alat"], matchType: "domain", pattern: "wemabank.com", verified: true },
  { needles: ["wema", "alat"], matchType: "domain", pattern: "alat.ng", verified: true },
  { needles: ["polaris"], matchType: "domain", pattern: "polarisbanklimited.com", verified: true },
  { needles: ["stanbic"], matchType: "domain", pattern: "stanbicibtc.com", verified: true },
  { needles: ["keystone"], matchType: "domain", pattern: "keystonebankng.com", verified: true },
  { needles: ["heritage"], matchType: "domain", pattern: "hbng.com", verified: true },
  { needles: ["providus"], matchType: "domain", pattern: "providusbank.com", verified: true },
  { needles: ["titan"], matchType: "domain", pattern: "titantrustbank.com", verified: true },
  { needles: ["jaiz"], matchType: "domain", pattern: "jaizbankplc.com", verified: true },
];

type Merchant = { merchant: string; category?: string; matchType: "exact" | "domain" | "subject"; pattern: string };

/** Verified merchant/subscription senders (first-party sources only). */
const MERCHANT_RULES: Merchant[] = [
  { merchant: "Adobe", category: "subscriptions", matchType: "exact", pattern: "noreply@adobe.com" },
  { merchant: "Adobe", category: "subscriptions", matchType: "exact", pattern: "noreply@adobe.net" },
  { merchant: "Adobe", category: "subscriptions", matchType: "exact", pattern: "message@adobe.com" },
  { merchant: "Adobe", category: "subscriptions", matchType: "exact", pattern: "noreply@acrobat.com" },
  { merchant: "Adobe", category: "subscriptions", matchType: "exact", pattern: "noreply@creativecloud.com" },
  { merchant: "Adobe", category: "subscriptions", matchType: "exact", pattern: "noreply@photoshop.com" },
  { merchant: "Adobe", category: "subscriptions", matchType: "exact", pattern: "storemanager@adobe.com" },
  { merchant: "Adobe", category: "subscriptions", matchType: "exact", pattern: "support@adobe.com" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.com" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.co.uk" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.de" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.fr" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.es" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.it" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.ca" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.com.au" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.ae" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.sa" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazon.com.tr" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "amazonsellerservices.com" },
  { merchant: "Amazon", category: "shopping", matchType: "domain", pattern: "sell.amazon.com" },
  { merchant: "Netflix", category: "subscriptions", matchType: "exact", pattern: "info@account.netflix.com" },
  { merchant: "Spotify", category: "subscriptions", matchType: "exact", pattern: "no-reply@spotify.com" },
  { merchant: "Apple", category: "subscriptions", matchType: "exact", pattern: "no_reply@email.apple.com" },
  { merchant: "Apple", category: "subscriptions", matchType: "domain", pattern: "email.apple.com" },
  { merchant: "YouTube", category: "subscriptions", matchType: "exact", pattern: "no-reply@youtube.com" },
  { merchant: "YouTube", category: "subscriptions", matchType: "exact", pattern: "noreply-purchases@youtube.com" },
  { merchant: "Google Play", category: "subscriptions", matchType: "exact", pattern: "googleplay-noreply@google.com" },
];

async function bulkUpsertSenderRules(rows: Array<{ bankId: string; matchType: string; pattern: string; verified: boolean }>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const chunk = rows.slice(offset, offset + 500);
    const values: string[] = [];
    const params: Array<string | boolean> = [];
    chunk.forEach((row, i) => {
      const base = i * 4;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, gen_random_uuid()::text, NOW())`);
      params.push(row.bankId, row.matchType, row.pattern, row.verified);
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "BankSenderRule" ("bankId", "matchType", "pattern", "verified", "id", "createdAt") VALUES ${values.join(", ")} ON CONFLICT ("bankId", "matchType", "pattern") DO UPDATE SET "verified" = EXCLUDED."verified"`,
      ...params,
    );
  }
}

async function seedRules() {
  const banks = await prisma.bank.findMany({ select: { id: true, name: true, slug: true, country: true, website: true } });
  const haystack = (bank: { name: string; slug: string | null }) => `${bank.name} ${bank.slug ?? ""}`.toLowerCase();

  const senderRows: Array<{ bankId: string; matchType: string; pattern: string; verified: boolean }> = [];
  const unmatched: string[] = [];
  for (const rule of NG_SENDER_RULES) {
    const matches = banks.filter(
      (bank) => bank.country === "NG" && rule.needles.some((needle) => haystack(bank).includes(needle)),
    );
    if (matches.length === 0) {
      unmatched.push(`${rule.matchType}:${rule.pattern}`);
      continue;
    }
    for (const bank of matches.slice(0, 5)) {
      senderRows.push({ bankId: bank.id, matchType: rule.matchType, pattern: rule.pattern, verified: rule.verified });
    }
    if (matches.length > 5) console.log(`note: ${rule.pattern} matched ${matches.length} banks, attached to first 5`);
  }

  // US: FDIC WEBADDR is self-reported and sparse — seed as UNVERIFIED domain
  // hints, only ever combined with finance keywords at classify time.
  for (const bank of banks) {
    if (bank.country !== "US" || !bank.website) continue;
    senderRows.push({ bankId: bank.id, matchType: "domain", pattern: bank.website, verified: false });
  }
  await bulkUpsertSenderRules(senderRows);

  for (let offset = 0; offset < MERCHANT_RULES.length; offset += 500) {
    const chunk = MERCHANT_RULES.slice(offset, offset + 500);
    const values: string[] = [];
    const params: Array<string | boolean> = [];
    chunk.forEach((rule, i) => {
      const base = i * 5;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, gen_random_uuid()::text, NOW())`);
      params.push(rule.merchant, rule.category ?? "", rule.matchType, rule.pattern, true);
    });
    await prisma.$executeRawUnsafe(
      `INSERT INTO "MerchantRule" ("merchant", "category", "matchType", "pattern", "verified", "id", "createdAt") VALUES ${values.join(", ")} ON CONFLICT ("merchant", "matchType", "pattern") DO UPDATE SET "verified" = EXCLUDED."verified", "category" = EXCLUDED."category"`,
      ...params,
    );
  }
  console.log(`sender rules: ${senderRows.length} (NG verified + US hints); merchants: ${MERCHANT_RULES.length}; unmatched: ${unmatched.join(", ") || "none"}`);
}

async function main() {
  await seedBanks();
  await seedRules();
  const [ng, us, senders, merchants] = await Promise.all([
    prisma.bank.count({ where: { country: "NG" } }),
    prisma.bank.count({ where: { country: "US" } }),
    prisma.bankSenderRule.count(),
    prisma.merchantRule.count(),
  ]);
  console.log(`directory totals — banks: ${ng} NG / ${us} US, sender rules: ${senders}, merchant rules: ${merchants}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
