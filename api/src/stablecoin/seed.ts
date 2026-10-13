/**
 * Known-entity seed data: providers and protocols Dobby can recognise.
 *
 * Ships names and narration patterns only. Addresses are deliberately absent.
 *
 * An address here is an identity claim, not a label: matching an inflow against
 * the wrong contract would record someone else's transfer as this user's yield,
 * inside a figure they then act on for tax. A missing address costs a weaker
 * match, which the confidence score already expresses. A wrong address costs a
 * misstatement we cannot detect. So the seed leaves them empty and the detector
 * treats an address-less entity as narration-only rather than as a match.
 *
 * To add an address: fill `address` below and run `seedKnownEntities`, which
 * upserts on (kind, name, chain). The Settings › Stablecoin providers page can
 * also add and edit these at runtime; this file is just the starting set.
 *
 * Narration patterns are lower-cased substrings. A pattern that looks like a
 * regex (`/…/`) is matched as one — that is how an exact sender can be pinned
 * without being so broad it matches the wrong one.
 */

export type KnownEntityKind = "offramp_provider" | "onramp_provider" | "yield_protocol" | "yield_token";

export type KnownEntitySeed = {
  kind: KnownEntityKind;
  name: string;
  chain?: "BASE" | "SOLANA";
  /** TODO(known-entities): fill in the verified address. Null until then. */
  address: null;
  narrationPatterns: string[];
  notes?: string;
};

/** Offramps: stablecoins in, naira out. Matched against naira credits. */
const OFFRAMP_PROVIDERS: KnownEntitySeed[] = [
  { kind: "offramp_provider", name: "Minisend", address: null, narrationPatterns: ["minisend", "mini send"] },
  { kind: "offramp_provider", name: "Paycrest", address: null, narrationPatterns: ["paycrest", "pay crest"] },
  { kind: "offramp_provider", name: "Yellow Card", address: null, narrationPatterns: ["yellow card", "yellowcard", "yellowcardpay"] },
  { kind: "offramp_provider", name: "Busha", address: null, narrationPatterns: ["busha"] },
  { kind: "offramp_provider", name: "Quidax", address: null, narrationPatterns: ["quidax"] },
  { kind: "offramp_provider", name: "Nium", address: null, narrationPatterns: ["nium"] },
  { kind: "offramp_provider", name: "Grey", address: null, narrationPatterns: ["grey Africa", "grey.africa"] },
  { kind: "offramp_provider", name: "P2P Nigeria", address: null, narrationPatterns: ["p2p nigeria"] },
];

/** Onramps: naira in, stablecoins out. Matched against naira debits. */
const ONRAMP_PROVIDERS: KnownEntitySeed[] = [
  { kind: "onramp_provider", name: "Minisend", address: null, narrationPatterns: ["minisend", "mini send"] },
  { kind: "onramp_provider", name: "Paycrest", address: null, narrationPatterns: ["paycrest", "pay crest"] },
  { kind: "onramp_provider", name: "Yellow Card", address: null, narrationPatterns: ["yellow card", "yellowcard", "yellowcardpay"] },
  { kind: "onramp_provider", name: "Busha", address: null, narrationPatterns: ["busha"] },
  { kind: "onramp_provider", name: "Quidax", address: null, narrationPatterns: ["quidax"] },
  { kind: "onramp_provider", name: "Cowrywise", address: null, narrationPatterns: ["cowrywise"] },
  { kind: "onramp_provider", name: "ProvidusBank", address: null, narrationPatterns: ["providusbank"] },
];

/**
 * Yield protocols: contracts that send rewards.
 *
 * Symbols and narration only — an address is the only reliable identifier here,
 * and inventing one would mark ordinary transfers as income. Each entry stays
 * inert until an address is filled in.
 */
const YIELD_PROTOCOLS: KnownEntitySeed[] = [
  { kind: "yield_protocol", name: "Ethena", address: null, narrationPatterns: ["ethena"], notes: "sUSDe / sUSDS yield tokens." },
  { kind: "yield_protocol", name: "Aave", address: null, narrationPatterns: ["aave", "aave v3"] },
  { kind: "yield_protocol", name: "Morpho", address: null, narrationPatterns: ["morpho"] },
  { kind: "yield_protocol", name: "Compound", address: null, narrationPatterns: ["compound"] },
  { kind: "yield_protocol", name: "Lido", address: null, narrationPatterns: ["lido"] },
];

/**
 * Yield-bearing tokens. Symbols only — these identify a receipt by its token
 * symbol, which is enough for the "possible yield" suggestion and not enough to
 * auto-confirm anything.
 */
const YIELD_TOKENS: KnownEntitySeed[] = [
  { kind: "yield_token", name: "sUSDe", address: null, narrationPatterns: ["susde"] },
  { kind: "yield_token", name: "sUSDS", address: null, narrationPatterns: ["susds"] },
  { kind: "yield_token", name: "aUSDC", address: null, narrationPatterns: ["ausdc"] },
  { kind: "yield_token", name: "aUSDT", address: null, narrationPatterns: ["ausdt"] },
  { kind: "yield_token", name: "USDY", address: null, narrationPatterns: ["usdy"] },
];

export const KNOWN_ENTITY_SEEDS: KnownEntitySeed[] = [
  ...OFFRAMP_PROVIDERS,
  ...ONRAMP_PROVIDERS,
  ...YIELD_PROTOCOLS,
  ...YIELD_TOKENS,
];