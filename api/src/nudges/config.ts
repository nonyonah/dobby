/**
 * Nudge rules.
 *
 * Every nudge in the product is one entry in this file. The engine holds the
 * rules that are true of all of them — frequency caps, the send window, priority,
 * collision with other email — so a new nudge is a definition and nothing else.
 *
 * Prices and the trial length are read from their owners rather than written
 * here, because a number typed into copy is a number that goes stale.
 */

import { TRIAL_DAYS } from "../lib/entitlement.js";
import { SUBSCRIPTION_PRICE_ANCHORS } from "../lib/bachs.js";

export type NudgeChannel = "email" | "in_app";

/**
 * Priority, lowest number first. Only the highest-priority due nudge is sent on
 * a run, so this ordering is the whole of "which one wins".
 */
export const PRIORITY = {
  trial: 1,
  /** Above a card subscription because it is the one that silently lapses. */
  renew: 2,
  day1_reminder: 3,
  review_pending: 4,
  monthly_statement: 5,
  try_email: 6,
  feature: 7,
  inactive: 8,
} as const;

/** Email frequency caps, per user. */
export const EMAIL_COOLDOWN_DAYS = 3;
export const EMAIL_PER_WEEK = 2;
/** How long a dismissed in-app nudge stays hidden. */
export const IN_APP_DISMISS_DAYS = 14;
/** Local send window, in the user's own timezone. */
export const SEND_WINDOW = { startHour: 9, endHour: 20 } as const;

/**
 * Days the daily jobs own. A nudge never goes out on one of these: the tax
 * digest, the filing-deadline reminder and the first-import summary each say
 * something more important than anything a nudge could.
 */
export const RESERVED_EMAIL_DAYS = {
  monthlyTax: { day: 1, hourUtc: 9 },
  filingDeadline: { hourUtc: 9 },
} as const;

/** Copy for one channel. State-dependent rules get a function. */
export type NudgeCopy = {
  subject: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
};

export type NudgeContext = {
  clerkId: string;
  email: string;
  firstName: string | null;
  now: Date;
  /** Days since the account was created. */
  ageDays: number;
  /** Hours since `lastActiveAt`, null when they have never come back. */
  inactiveHours: number | null;
  /** Entitlement, so rules never re-derive access. */
  isPro: boolean;
  status: string;
  trialDaysLeft: number | null;
  /**
   * Whole days until a one-time purchase runs out, null when there is none.
   *
   * Separate from `trialDaysLeft` on purpose: one is ours and deliberate, the
   * other was paid for once and will simply stop.
   */
  oneTimeDaysLeft: number | null;
  /** A live card subscription, which renews without the customer doing anything. */
  hasLiveSubscription: boolean;
  /** Live facts a rule may need. Computed per user, cached for the run. */
  facts: NudgeFacts;
};

export type NudgeFacts = {
  setupComplete: boolean;
  hasImport: boolean;
  hasEmailConnection: boolean;
  hasWallet: boolean;
  reviewPendingCount: number;
  reviewOldestDays: number | null;
  transactionsTotal: number;
  uncategorizedCount: number;
  manuallyRecategorisedCount: number;
  hasRules: boolean;
  daysSinceFirstImport: number | null;
  daysSinceLastImport: number | null;
  taxModuleAvailable: boolean;
  importedTransactions: number;
  openedTaxSection: boolean;
  /**
   * Set for the day after a one-time purchase ended. A separate flag rather
   * than a negative `oneTimeDaysLeft`, so "ended yesterday" stays expressible
   * once the number would have gone negative.
   */
  oneTimeJustExpired: boolean;
};

export type NudgeRule = {
  key: string;
  priority: number;
  channels: NudgeChannel[];
  /** Total sends ever allowed for this rule, across all time. */
  maxSends: number;
  /** Minimum gap between sends, in days. */
  cooldownDays: number;
  /** Extra rule-level condition, on top of the global ones. */
  due: (context: NudgeContext) => boolean;
  copy: (context: NudgeContext) => NudgeCopy;
};

// -- shared copy fragments -------------------------------------------------

const TRIAL_LENGTH = `${TRIAL_DAYS}-day`;
const MONTHLY_PRICE = `$${Number(SUBSCRIPTION_PRICE_ANCHORS.month).toFixed(0)}`;

/**
 * Day-one drop-off.
 *
 * Three different messages because there are three different states, and a
 * "finish setting up" email to someone who finished three days ago is worse than
 * sending nothing.
 */
const day1Reminder: NudgeRule = {
  key: "day1_reminder",
  priority: PRIORITY.day1_reminder,
  channels: ["email", "in_app"],
  maxSends: 2,
  cooldownDays: 2,
  due: ({ ageDays, inactiveHours, facts }) =>
    // First week only, and only while they have actually gone quiet.
    ageDays >= 1 && ageDays < 7 && (inactiveHours ?? 0) >= 24 && !facts.setupComplete,
  copy: ({ firstName, facts }) => {
    const name = firstName ? `, ${firstName}` : "";
    if (!facts.hasImport) {
      return {
        subject: `Finish setting up Dobby${name}: about a minute left`,
        headline: `You're a step or two from seeing where your money went${name}.`,
        body: "Pick up where you stopped.",
        ctaLabel: "Continue setup",
        ctaPath: "/transactions",
      };
    }
    return {
      subject: "Your first month is sorted",
      headline: "Your first month is sorted.",
      body: "Look over the few transactions Dobby wasn't sure about, then see where you stand.",
      ctaLabel: "Open Dobby",
      ctaPath: "/insights",
    };
  },
};

/**
 * The trial clock is the one thing that expires on a date we chose, so it gets
 * the highest priority and fires while there is still a decision left to make.
 */
const trialExpiring: NudgeRule = {
  key: "trial",
  priority: PRIORITY.trial,
  channels: ["email", "in_app"],
  maxSends: 2,
  cooldownDays: 1,
  due: ({ isPro, status, trialDaysLeft }) => isPro && status === "trial" && trialDaysLeft !== null && trialDaysLeft <= 2,
  copy: ({ firstName, trialDaysLeft }) => {
    const name = firstName ? `, ${firstName}` : "";
    const days = trialDaysLeft ?? 0;
    const when = days <= 1 ? "today" : `in ${days} days`;
    return {
      subject: `Your Pro trial ends ${when}`,
      headline: days <= 1 ? `Your Pro trial ends today${name}.` : `Your Pro trial ends ${when}${name}.`,
      body: "Nothing is deleted when it runs out — your imports, categories and ledger stay free forever. Pro adds email auto-fetch, stablecoin wallets and proactive AI flags.",
      ctaLabel: "Keep Pro",
      ctaPath: "/settings",
    };
  },
};

/**
 * Transactions sitting in the review queue are the only thing in the product
 * that gets visibly worse the longer it is ignored, so this outranks every
 * feature prompt.
 */
const reviewPending: NudgeRule = {
  key: "review_pending",
  priority: PRIORITY.review_pending,
  channels: ["email", "in_app"],
  maxSends: 3,
  cooldownDays: 4,
  due: ({ facts }) => facts.reviewPendingCount >= 3 && (facts.reviewOldestDays ?? 0) >= 2,
  copy: ({ facts }) => {
    const count = facts.reviewPendingCount;
    return {
      subject: `${count} transactions are waiting for you`,
      headline: `${count} transactions${count === 1 ? " is" : "s are"} still waiting for you.`,
      body: "Dobby flagged these because it wasn't sure. Answering even a few sharpens every later import.",
      ctaLabel: "Review them",
      ctaPath: "/transactions",
    };
  },
};

/**
 * A month of real data is worth looking at, but only once it exists.
 *
 * Held behind 28 days deliberately: a statement summary for someone with four
 * transactions teaches them nothing and makes the product look thin.
 */
const monthlyStatement: NudgeRule = {
  key: "monthly_statement",
  priority: PRIORITY.monthly_statement,
  channels: ["email", "in_app"],
  maxSends: 3,
  cooldownDays: 7,
  due: ({ inactiveHours, facts }) =>
    facts.hasImport &&
    facts.importedTransactions >= 20 &&
    (facts.daysSinceFirstImport ?? 0) >= 28 &&
    (inactiveHours ?? 0) >= 48,
  copy: ({ firstName }) => {
    const name = firstName ? `, ${firstName}` : "";
    return {
      subject: "Your month in review is ready",
      headline: `See where your money actually went${name}.`,
      body: "A month of your own transactions, sorted into what you actually spent on and what came in.",
      ctaLabel: "Open Insights",
      ctaPath: "/insights",
    };
  },
};

/**
 * Email auto-fetch is the feature people come for, so it is offered to people
 * who have already got value from the manual path and have not switched over.
 */
const tryEmail: NudgeRule = {
  key: "try_email",
  priority: PRIORITY.try_email,
  channels: ["email", "in_app"],
  maxSends: 2,
  cooldownDays: 7,
  due: ({ isPro, facts }) =>
    isPro && facts.hasImport && !facts.hasEmailConnection && (facts.daysSinceFirstImport ?? 0) >= 2,
  copy: ({ firstName }) => {
    const name = firstName ? `, ${firstName}` : "";
    return {
      subject: "Stop uploading statements",
      headline: `Dobby can read your statements for you${name}.`,
      body: "Connect a mailbox and new statements land in your ledger on their own, already categorised.",
      ctaLabel: "Connect email",
      ctaPath: "/settings",
    };
  },
};

/**
 * Feature prompts, one key and one send budget.
 *
 * Several prompts under a single key on purpose: they are all "there is a part
 * of this you have not used", and treating them as separate nudges would spend
 * the frequency cap four times on the same message.
 */
const feature: NudgeRule = {
  key: "feature",
  priority: PRIORITY.feature,
  channels: ["email", "in_app"],
  maxSends: 2,
  cooldownDays: 10,
  due: ({ isPro, ageDays, facts }) =>
    (isPro && facts.hasImport && !facts.hasWallet && ageDays >= 5) ||
    (facts.manuallyRecategorisedCount >= 5 && !facts.hasRules) ||
    (facts.taxModuleAvailable && facts.importedTransactions >= 30 && !facts.openedTaxSection),
  copy: ({ isPro, firstName, facts }) => {
    const name = firstName ? `, ${firstName}` : "";
    // Same order as `due`, so the copy always describes the reason it fired.
    if (isPro && facts.hasImport && !facts.hasWallet) {
      return {
        subject: "Track your crypto in Dobby",
        headline: `Your on-chain spending is still missing${name}.`,
        body: "Add a wallet address and DeFi flows show up in the same ledger as your bank, already categorised.",
        ctaLabel: "Add a wallet",
        ctaPath: "/wallets",
      };
    }
    if (facts.manuallyRecategorisedCount >= 5 && !facts.hasRules) {
      return {
        subject: "Stop fixing the same thing twice",
        headline: `You keep correcting the same merchants${name}.`,
        body: "A rule does it once and every later statement gets it right automatically.",
        ctaLabel: "Create a rule",
        ctaPath: "/settings/categories-rules",
      };
    }
    return {
      subject: "Your tax estimate is waiting",
      headline: `We can estimate what you owe${name}.`,
      body: "Built for your jurisdiction, from the income and spending already in your ledger.",
      ctaLabel: "Check my estimate",
      ctaPath: "/budget",
    };
  },
};

/**
 * Win-back. Email only: an on-screen card is for someone already in the app,
 * and showing one to someone who has not opened it in a fortnight is just noise
 * waiting for them to come back to something they already ignored.
 */
const inactive: NudgeRule = {
  key: "inactive",
  priority: PRIORITY.inactive,
  channels: ["email"],
  maxSends: 1,
  cooldownDays: 30,
  due: ({ ageDays, inactiveHours }) => ageDays >= 14 && (inactiveHours ?? 0) >= 24 * 14,
  copy: ({ firstName }) => {
    const name = firstName ? `, ${firstName}` : "";
    return {
      subject: "Your Dobby data is still here",
      headline: `Nothing was deleted${name}.`,
      body: "Your imports, categories and ledger are exactly where you left them. Pick up whenever you're ready — Pro is still running until it ends.",
      ctaLabel: "Open Dobby",
      ctaPath: "/transactions",
    };
  },
};

/**
 * Renewal reminders for one-time purchasers.
 *
 * A card subscriber renews without being asked, so telling one "your access ends
 * in 7 days" would be telling them about something they will not have to do.
 * These fire only for `oneTimePaidUntil` and only when there is no live
 * subscription, which is exactly the population that has to think about it.
 *
 * One rule key with three copy branches rather than three keys: the send window,
 * frequency cap and unsubscribe rules are shared, and a customer moving 7 days →
 * 2 days → expired is one thread of contact, not three.
 */
const oneTimeRenewal: NudgeRule = {
  key: "renew",
  priority: PRIORITY.renew,
  channels: ["email", "in_app"],
  maxSends: 3,
  cooldownDays: 1,
  due: ({ facts, oneTimeDaysLeft, hasLiveSubscription }) =>
    // Not to a card subscriber: their renewal is automatic, and the reminder
    // would be asking them to do something they never have to do.
    //
    // The window is bounded at both ends. Without the lower bound, `-3 <= 7` is
    // true and this fires every cooldown for a term that ended three days ago,
    // telling someone their access is about to end when it already has.
    !hasLiveSubscription &&
    oneTimeDaysLeft !== null &&
    (facts.oneTimeJustExpired || (oneTimeDaysLeft >= 0 && oneTimeDaysLeft <= 7)),
  copy: ({ firstName, oneTimeDaysLeft, facts }) => {
    const name = firstName ? `, ${firstName}` : "";
    const CTA = { ctaLabel: "Renew Pro", ctaPath: "/settings#plan" };

    if (facts.oneTimeJustExpired) {
      return {
        subject: "Your Pro access has ended",
        headline: `Your Pro access has ended${name}.`,
        body: "Everything you imported is still here. Renew any time to bring Pro back.",
        ...CTA,
      };
    }
    if ((oneTimeDaysLeft ?? 0) <= 2) {
      return {
        subject: "2 days left on Pro",
        headline: `2 days left on Pro${name}.`,
        body: "Renew by bank transfer or crypto in a minute, or switch to card so it renews on its own.",
        ...CTA,
      };
    }
    return {
      subject: "Your Pro access ends in 7 days",
      headline: `Your Pro access ends in 7 days${name}.`,
      body: "Renew by bank transfer or crypto in a minute, or switch to card so it renews on its own.",
      ...CTA,
    };
  },
};

/**
 * The whole set, in the order they compete for a send. Adding a nudge means
 * adding one entry to this array.
 */
export const NUDGE_RULES: NudgeRule[] = [
  trialExpiring,
  oneTimeRenewal,
  day1Reminder,
  reviewPending,
  monthlyStatement,
  tryEmail,
  feature,
  inactive,
];

export const NUDGE_KEYS = NUDGE_RULES.map((rule) => rule.key);