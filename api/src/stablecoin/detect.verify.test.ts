import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionType } from "@prisma/client";

/**
 * Acceptance checks for stablecoin detection, run against a real database.
 *
 * Opt-in, because it writes:
 *   DOBBY_DB_PARITY=1 DATABASE_URL=postgresql://... npx vitest run src/stablecoin/detect.verify.test.ts
 *
 * Each check below corresponds to a claim that is easy to get wrong in a way
 * no unit test would notice — a fabricated cash-out, a yield receipt taxed as
 * principal, a duplicate suggestion every time a job runs. The OPay statement
 * is the real one the product was built against: it contains a credit from an
 * offramp provider and a credit from a payment processor, and only the first
 * should ever produce a suggestion.
 */

// The database is a remote pooled instance, so even a handful of round trips
// can outrun the 10s default. Raising it here rather than globally keeps the
// rest of the suite fast.
vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const RUN = process.env.DOBBY_DB_PARITY === "1";
const OWNER = "user_stablecoin_verify";

const NGN_PER_USD = 1_500;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000);

let prisma: typeof import("../lib/prisma.js").prisma;
let detectStablecoinEvents: typeof import("./detect.js").detectStablecoinEvents;
let setFxRateProvider: typeof import("../lib/fx.js").setFxRateProvider;

async function seedEntity(input: { kind: string; name: string; address?: string; patterns?: string[] }) {
  return prisma.knownEntity.create({
    data: {
      kind: input.kind,
      name: input.name,
      address: input.address ?? null,
      narrationPatterns: (input.patterns ?? [input.name.toLowerCase()]).map((pattern) => pattern.toLowerCase()),
    },
  });
}

/** A stablecoin leaving a tracked wallet, as wallet-sync would persist it. */
async function seedOutflow(overrides: { id?: string; amount?: number; hoursAgo?: number; from?: string } = {}) {
  return prisma.transaction.create({
    data: {
      ownerClerkId: OWNER,
      type: TransactionType.TRANSFER,
      amount: overrides.amount ?? 250,
      currency: "USD",
      assetSymbol: "USDC",
      description: "USDC sent to offramp",
      occurredAt: at(overrides.hoursAgo ?? 1),
      source: "wallet",
      externalId: overrides.id ?? `outflow-${Math.random().toString(36).slice(2)}`,
      transferDirection: "OUT",
      isTaxable: false,
      taxTreatment: "not_taxable",
      metadata: { chain: "BASE", hash: `0x${Math.random().toString(36).slice(2)}`, from: overrides.from ?? "0xofframp" },
    },
  });
}

/** A naira credit in the bank ledger, as an import or email sync would persist it. */
async function seedCredit(overrides: { description: string; amount: number; hoursAgo?: number; type?: TransactionType }) {
  return prisma.transaction.create({
    data: {
      ownerClerkId: OWNER,
      type: overrides.type ?? TransactionType.TRANSFER,
      amount: overrides.amount,
      currency: "NGN",
      description: overrides.description,
      occurredAt: at(overrides.hoursAgo ?? 1),
      source: "bank",
    },
  });
}

beforeEach(async () => {
  if (!RUN) return;
  ({ prisma } = await import("../lib/prisma.js"));
  ({ detectStablecoinEvents } = await import("./detect.js"));
  ({ setFxRateProvider } = await import("../lib/fx.js"));
  // A deterministic reference rate, so a test never depends on the network and
  // the pairing decision is about the logic rather than today's rate.
  setFxRateProvider(async () => ({ rate: NGN_PER_USD, date: "2026-01-01", source: "configured" }));
  await prisma.user.upsert({ where: { clerkId: OWNER }, create: { clerkId: OWNER }, update: {} });
  await prisma.stablecoinEvent.deleteMany({ where: { ownerClerkId: OWNER } });
  await prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } });
  await prisma.emailImport.deleteMany({ where: { ownerClerkId: OWNER } });
  await prisma.knownEntity.deleteMany({ where: { name: { startsWith: "Verify" } } });
});

afterEach(async () => {
  if (!RUN) return;
  setFxRateProvider(null);
});

describe.runIf(RUN)("stablecoin detection", () => {
  it("suggests a cash-out when a stablecoin outflow and a naira credit pair up", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyMinisend", patterns: ["minisend", "mini send"] });
    const outflow = await seedOutflow({ amount: 250, hoursAgo: 2 });
    await seedCredit({ description: "Payment from Minisend", amount: 375_000, hoursAgo: 1 });

    await detectStablecoinEvents(OWNER);
    const events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "CASH_OUT" } });

    expect(events).toHaveLength(1);
    expect(Number(events[0]!.tokenAmount)).toBeCloseTo(250);
    expect(Number(events[0]!.nairaAmount)).toBeCloseTo(375_000);
    expect(Number(events[0]!.impliedRate)).toBeCloseTo(1_500, 0);
    expect(events[0]!.linkedTransactionId).toBe(outflow.id);
  });

  it("starts as a suggestion and is never auto-confirmed", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyMinisend", patterns: ["minisend", "mini send"] });
    await seedOutflow({ amount: 250, hoursAgo: 2 });
    await seedCredit({ description: "Payment from Minisend", amount: 375_000, hoursAgo: 1 });

    await detectStablecoinEvents(OWNER);
    const events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER } });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.status === "SUGGESTED")).toBe(true);
    expect(events.every((event) => event.confirmedAt === null)).toBe(true);
  });

  it("creates no duplicates when the job runs twice", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyMinisend", patterns: ["minisend", "mini send"] });
    await seedOutflow({ amount: 250, hoursAgo: 2 });
    await seedCredit({ description: "Payment from Minisend", amount: 375_000, hoursAgo: 1 });

    await detectStablecoinEvents(OWNER);
    const second = await detectStablecoinEvents(OWNER);

    expect(second.created).toBe(0);
    expect(second.duplicates).toBeGreaterThan(0);
    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER } })).toBe(1);
  });

  it("leaves a payment-processor credit alone and never guesses at a person-to-person one", async () => {
    // The two rows the OPay statement actually contains. The processor credit
    // is an ordinary receipt and the P2P one is indistinguishable from it apart
    // from the name; neither may become a cash-out.
    await seedCredit({ description: "API-TRANSFER CREDIT", amount: 50_000, hoursAgo: 1 });
    await seedCredit({ description: "Transfer from Chidi Okeke", amount: 20_000, hoursAgo: 3 });

    await detectStablecoinEvents(OWNER);
    const events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "CASH_OUT" } });

    expect(events).toHaveLength(0);
  });

  it("does not pair a naira credit whose rate is nowhere near the reference", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyMinisend", patterns: ["minisend", "mini send"] });
    await seedOutflow({ amount: 250, hoursAgo: 2 });
    // 375,000 naira for 250 USD is the right rate; 75,000 is not, and matching
    // them anyway is how a fabricated cash-out gets into a tax figure.
    await seedCredit({ description: "Payment from Minisend", amount: 75_000, hoursAgo: 1 });

    await detectStablecoinEvents(OWNER);

    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER, kind: "CASH_OUT" } })).toBe(0);
  });

  it("does not pair legs that fall outside the window", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyMinisend", patterns: ["minisend", "mini send"] });
    await seedOutflow({ amount: 250, hoursAgo: 1 });
    await seedCredit({ description: "Payment from Minisend", amount: 375_000, hoursAgo: 30 });

    await detectStablecoinEvents(OWNER);

    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER, kind: "CASH_OUT" } })).toBe(0);
  });

  it("records the stamp duty as a note and never as an amount", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyMinisend", patterns: ["minisend", "mini send"] });
    await seedOutflow({ amount: 250, hoursAgo: 2 });
    await seedCredit({ description: "Payment from Minisend", amount: 375_000, hoursAgo: 1 });

    await detectStablecoinEvents(OWNER);
    const [event] = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "CASH_OUT" } });

    expect(event!.stampDutyNote).toBe(true);
    // 1.5% of 375,000 would be 5,625. Nothing anywhere records a duty amount.
    const serialised = JSON.stringify(event, (_key, value) => (typeof value === "object" && value !== null && "toString" in value ? String(value) : value));
    expect(serialised).not.toContain("5625");
  });

  it("records no USD value for a naira-pegged token", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyMinisend", patterns: ["minisend", "mini send"] });
    await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: TransactionType.TRANSFER,
        amount: 400_000,
        currency: "NGN",
        assetSymbol: "CNGN",
        description: "CNGN sent to offramp",
        occurredAt: at(2),
        source: "wallet",
        externalId: `cngn-${Math.random().toString(36).slice(2)}`,
        transferDirection: "OUT",
        isTaxable: false,
        metadata: { chain: "BASE", hash: "0xcngn", from: "0xofframp" },
      },
    });
    await seedCredit({ description: "Payment from Minisend", amount: 375_000, hoursAgo: 1 });

    await detectStablecoinEvents(OWNER);
    const events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "CASH_OUT" } });

    expect(events).toHaveLength(1);
    // Zero would read as "worth nothing"; null reads as "not applicable".
    expect(events[0]!.usdValue).toBeNull();
  });

  it("creates a yield event from a known protocol address, and only then", async () => {
    const protocol = await seedEntity({ kind: "yield_protocol", name: "VerifyProtocol", address: "0xProtocolAddress" });
    const inflow = await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: TransactionType.TRANSFER,
        amount: 12.4,
        currency: "USD",
        assetSymbol: "USDC",
        description: "USDC received from protocol",
        occurredAt: at(1),
        source: "wallet",
        externalId: `yield-${Math.random().toString(36).slice(2)}`,
        transferDirection: "IN",
        isTaxable: false,
        metadata: { chain: "BASE", hash: "0xyield", from: "0xProtocolAddress" },
      },
    });

    await detectStablecoinEvents(OWNER);
    let events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "YIELD_RECEIVED" } });

    expect(events).toHaveLength(1);
    expect(Number(events[0]!.tokenAmount)).toBeCloseTo(12.4);
    expect(events[0]!.linkedTransactionId).toBe(inflow.id);
    expect(events[0]!.entityId).toBe(protocol.id);

    // The same inflow from an address nobody has verified must not become yield.
    await prisma.stablecoinEvent.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.transaction.update({ where: { id: inflow.id }, data: { metadata: { chain: "BASE", hash: "0xyield", from: "0xStranger" } } });
    await detectStablecoinEvents(OWNER);
    events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "YIELD_RECEIVED" } });

    expect(events).toHaveLength(0);
  });

  it("does not suggest yield for a wallet that was never opted in", async () => {
    await prisma.walletAccount.create({ data: { ownerClerkId: OWNER, chain: "BASE", address: "0xWalletUnderTest", displayName: "Test", color: "#000000" } });
    for (let i = 0; i < 3; i++) {
      await prisma.transaction.create({
        data: {
          ownerClerkId: OWNER,
          type: TransactionType.TRANSFER,
          amount: 1.2,
          currency: "USD",
          assetSymbol: "USDC",
          description: "USDC received",
          occurredAt: at(i + 1),
          source: "wallet",
          externalId: `small-${i}-${Math.random().toString(36).slice(2)}`,
          transferDirection: "IN",
          isTaxable: false,
          metadata: { chain: "BASE", hash: `0xsmall${i}`, from: "0xSameContract" },
        },
      });
    }

    await detectStablecoinEvents(OWNER);
    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER, kind: "YIELD_RECEIVED" } })).toBe(0);
  });

  it("suggests yield for an opted-in wallet, still as a suggestion", async () => {
    await prisma.walletAccount.create({ data: { ownerClerkId: OWNER, chain: "BASE", address: "0xWalletYielding", displayName: "Test", color: "#000000", earnsYield: true } });
    for (let i = 0; i < 3; i++) {
      await prisma.transaction.create({
        data: {
          ownerClerkId: OWNER,
          type: TransactionType.TRANSFER,
          amount: 1.2,
          currency: "USD",
          assetSymbol: "USDC",
          description: "USDC received",
          occurredAt: at(i + 1),
          source: "wallet",
          externalId: `small-y-${i}-${Math.random().toString(36).slice(2)}`,
          transferDirection: "IN",
          isTaxable: false,
          metadata: { chain: "BASE", hash: `0xsmallY${i}`, from: "0xSameContract" },
        },
      });
    }

    await detectStablecoinEvents(OWNER);
    const events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "YIELD_RECEIVED" } });

    expect(events).toHaveLength(1);
    expect(events[0]!.status).toBe("SUGGESTED");
    expect(Number(events[0]!.tokenAmount)).toBeCloseTo(3.6);
  });

  it("keeps a confirmed yield out of the taxable total until it is confirmed", async () => {
    // Only the reward is income, and only once a person says so. This is the
    // check that principal is never taxed.
    const category = await prisma.category.create({ data: { ownerClerkId: OWNER, name: "Yield / investment income" } });
    await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: TransactionType.INCOME,
        amount: 12.4,
        currency: "USD",
        assetSymbol: "USDC",
        description: "Stablecoin yield",
        occurredAt: at(1),
        source: "wallet",
        categoryId: category.id,
        isTaxable: true,
        taxTreatment: "taxable",
        incomeSource: "INVESTMENT",
      },
    });
    const before = await prisma.transaction.aggregate({ where: { ownerClerkId: OWNER, type: TransactionType.INCOME, isTaxable: true }, _sum: { amount: true } });

    expect(Number(before._sum.amount)).toBeCloseTo(12.4);
    // No principal row exists to inflate it.
    expect(await prisma.transaction.count({ where: { ownerClerkId: OWNER, type: TransactionType.TRANSFER } })).toBe(0);
  });

  it("detects an on-ramp from a naira debit beside a stablecoin inflow", async () => {
    await seedEntity({ kind: "onramp_provider", name: "VerifyQuidax", patterns: ["quidax"] });
    const inflow = await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: TransactionType.TRANSFER,
        amount: 300,
        currency: "USD",
        assetSymbol: "USDC",
        description: "USDC received",
        occurredAt: at(1),
        source: "wallet",
        externalId: `onramp-in-${Math.random().toString(36).slice(2)}`,
        transferDirection: "IN",
        isTaxable: false,
        metadata: { chain: "BASE", hash: "0xonrampin", from: "0xQuidax" },
      },
    });
    await seedCredit({ description: "Payment to Quidax", amount: 450_000, hoursAgo: 1, type: TransactionType.EXPENSE });

    await detectStablecoinEvents(OWNER);
    const events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "ON_RAMP" } });

    expect(events).toHaveLength(1);
    expect(events[0]!.linkedTransactionId).toBe(inflow.id);
    expect(Number(events[0]!.nairaAmount)).toBeCloseTo(450_000);
    expect(events[0]!.status).toBe("SUGGESTED");
  });

  it("does not turn an ordinary naira payment into an on-ramp", async () => {
    await seedEntity({ kind: "onramp_provider", name: "VerifyQuidax", patterns: ["quidax"] });
    await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: TransactionType.TRANSFER,
        amount: 300,
        currency: "USD",
        assetSymbol: "USDC",
        description: "USDC received",
        occurredAt: at(1),
        source: "wallet",
        externalId: `onramp-nomatch-${Math.random().toString(36).slice(2)}`,
        transferDirection: "IN",
        isTaxable: false,
        metadata: { chain: "BASE", hash: "0xplain", from: "0xSomeone" },
      },
    });
    // Ordinary transfer to a person, not to an onramp.
    await seedCredit({ description: "Transfer to Chidi Okeke", amount: 450_000, hoursAgo: 1, type: TransactionType.EXPENSE });

    await detectStablecoinEvents(OWNER);

    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER, kind: "ON_RAMP" } })).toBe(0);
  });

  it("records a redemption gain as the difference, never the deposit", async () => {
    // The real round trip: USDC deposited, a position token received, that
    // token sent back, and USDC recovered with more than went in.
    const walletLeg = (input: { amount: number; symbol: string; direction: "IN" | "OUT"; hoursAgo: number; hash: string }) =>
      prisma.transaction.create({
        data: {
          ownerClerkId: OWNER,
          type: TransactionType.TRANSFER,
          amount: input.amount,
          currency: "USD",
          assetSymbol: input.symbol,
          description: `${input.symbol} movement`,
          occurredAt: at(input.hoursAgo),
          source: "wallet",
          externalId: `${input.hash}-${Math.random().toString(36).slice(2)}`,
          transferDirection: input.direction,
          isTaxable: false,
          metadata: { chain: "BASE", hash: input.hash, from: "0xVault" },
        },
      });

    await walletLeg({ amount: 1000, symbol: "USDC", direction: "OUT", hoursAgo: 40, hash: "0xdep" });
    await walletLeg({ amount: 1000, symbol: "sUSDe", direction: "IN", hoursAgo: 39, hash: "0xposin" });
    await walletLeg({ amount: 1000, symbol: "sUSDe", direction: "OUT", hoursAgo: 2, hash: "0xposout" });
    await walletLeg({ amount: 1012.5, symbol: "USDC", direction: "IN", hoursAgo: 1, hash: "0xrecov" });

    await detectStablecoinEvents(OWNER);
    const events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "YIELD_REDEMPTION_GAIN" } });

    expect(events).toHaveLength(1);
    expect(Number(events[0]!.tokenAmount)).toBeCloseTo(12.5);
    expect(events[0]!.status).toBe("SUGGESTED");
  });

  it("does not call an ordinary purchase of the underlying a redemption", async () => {
    // Underlying in, with no position token leaving first. That is buying, and
    // treating it as a gain would invent income from a purchase.
    await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: TransactionType.TRANSFER,
        amount: 500,
        currency: "USD",
        assetSymbol: "USDC",
        description: "USDC received",
        occurredAt: at(1),
        source: "wallet",
        externalId: `buy-${Math.random().toString(36).slice(2)}`,
        transferDirection: "IN",
        isTaxable: false,
        metadata: { chain: "BASE", hash: "0xbuy", from: "0xExchange" },
      },
    });

    await detectStablecoinEvents(OWNER);

    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER, kind: "YIELD_REDEMPTION_GAIN" } })).toBe(0);
  });

  it("never records a principal deposit as income", async () => {
    await prisma.transaction.create({
      data: {
        ownerClerkId: OWNER,
        type: TransactionType.TRANSFER,
        amount: 5000,
        currency: "USD",
        assetSymbol: "sUSDe",
        description: "sUSDe deposited",
        occurredAt: at(3),
        source: "wallet",
        externalId: `principal-${Math.random().toString(36).slice(2)}`,
        transferDirection: "OUT",
        isTaxable: false,
        metadata: { chain: "BASE", hash: "0xprincipal", from: "0xVault" },
      },
    });

    await detectStablecoinEvents(OWNER);

    // A deposit on its own yields nothing at all. Marking it income would tax
    // money that never left the user's control.
    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER, kind: "YIELD_RECEIVED" } })).toBe(0);
    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER, kind: "YIELD_REDEMPTION_GAIN" } })).toBe(0);
    expect(await prisma.transaction.count({ where: { ownerClerkId: OWNER, type: TransactionType.INCOME } })).toBe(0);
  });

  it("raises a cash-out from the provider's own receipt email even when the rate is off", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyBusha", patterns: ["busha"] });
    await seedOutflow({ amount: 200, hoursAgo: 2, from: "0xBusha" });
    // Deliberately far from the 1,500 reference: the provider's email is a
    // first-party statement about this withdrawal, so the cross-check failing
    // must not discard it. Both legs still have to exist.
    await seedCredit({ description: "Payment from Busha", amount: 250_000, hoursAgo: 1 });
    await prisma.emailImport.create({
      data: {
        ownerClerkId: OWNER,
        provider: "gmail",
        messageId: `verify-msg-${Math.random().toString(36).slice(2)}`,
        subject: "Your withdrawal is complete",
        fromAddress: "no-reply@busha.com",
        receivedAt: at(1),
        kind: "receipt",
        status: "skipped",
      },
    });

    await detectStablecoinEvents(OWNER);
    const events = await prisma.stablecoinEvent.findMany({ where: { ownerClerkId: OWNER, kind: "CASH_OUT" } });

    expect(events).toHaveLength(1);
    expect(Number(events[0]!.matchConfidence)).toBeGreaterThanOrEqual(0.9);
    expect(events[0]!.status).toBe("SUGGESTED");
  });

  it("ignores promotional mail that is not a completed withdrawal", async () => {
    await seedEntity({ kind: "offramp_provider", name: "VerifyBusha", patterns: ["busha"] });
    await seedOutflow({ amount: 200, hoursAgo: 2, from: "0xBusha" });
    await seedCredit({ description: "Payment from Busha", amount: 250_000, hoursAgo: 1 });
    await prisma.emailImport.create({
      data: {
        ownerClerkId: OWNER,
        provider: "gmail",
        messageId: `verify-promo-${Math.random().toString(36).slice(2)}`,
        subject: "Withdraw to naira in minutes with Busha",
        fromAddress: "marketing@busha.com",
        receivedAt: at(1),
        kind: "receipt",
        status: "skipped",
      },
    });

    await detectStablecoinEvents(OWNER);

    // The rate is off and the mail is advertising, so nothing may be raised.
    expect(await prisma.stablecoinEvent.count({ where: { ownerClerkId: OWNER, kind: "CASH_OUT" } })).toBe(0);
  });

  it("cleans up", async () => {
    await prisma.stablecoinEvent.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.transaction.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.category.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.walletAccount.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.knownEntity.deleteMany({ where: { name: { startsWith: "Verify" } } });
    await prisma.user.deleteMany({ where: { clerkId: OWNER } });
    await prisma.$disconnect();
  });
});