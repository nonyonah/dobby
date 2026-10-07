import { ApiError } from "@/lib/api-client";

/**
 * Prescriptive error copy.
 *
 * Not every failure deserves a walkthrough — a generic "something went wrong"
 * is the honest response to a bug the user cannot act on. These are the cases
 * where we know the likely cause and the user genuinely has a next step, so we
 * say what happened *and* what to do about it. Anything unrecognised falls
 * through to a short, plain line.
 */
export type ErrorContext =
  | "load"
  | "save"
  | "import"
  | "payment"
  | "email"
  | "wallet"
  | "trial"
  | "ai"
  | "rates";

export interface ErrorGuidance {
  /** Short headline — what went wrong. */
  title: string;
  /** Ordered steps the user can actually take. */
  steps: string[];
  /** Optional single next action. */
  action?: { label: string; href?: string; onClick?: () => void };
  /** True when the cause is on our side and retrying is the right move. */
  retryable: boolean;
}

const GENERIC: Record<ErrorContext, string> = {
  load: "We couldn’t load this just now.",
  save: "We couldn’t save that.",
  import: "We couldn’t read that file.",
  payment: "The payment didn’t go through.",
  email: "We couldn’t finish setting up email sync.",
  wallet: "We couldn’t connect that wallet.",
  trial: "Your trial has ended.",
  ai: "The AI features aren’t available right now.",
  rates: "We couldn’t fetch exchange rates.",
};

/** Codes the user can fix themselves, or that are worth explaining at all. */
function byCode(code: string | null, context: ErrorContext): ErrorGuidance | null {
  switch (code) {
    case "UPGRADE_REQUIRED":
      return {
        title: "Your free trial has ended",
        steps: [
          "Upgrade to Pro to turn editing, imports and tax tools back on — your data stays exactly as it is.",
          "Already subscribed? Sign out and back in so the new plan is picked up.",
        ],
        action: { label: "See plans", href: "/settings" },
        retryable: false,
      };
    case "FRANKFURTER_UPSTREAM_ERROR":
    case "FRANKFURTER_RATE_UNAVAILABLE":
      return {
        title: "Exchange rates are unavailable",
        steps: [
          "Totals are shown in the original amounts for now, so nothing is lost.",
          "Exchange rates refresh hourly — try again shortly, or keep your display currency as-is in the meantime.",
        ],
        retryable: true,
      };
    case "AI_GATEWAY_NOT_CONFIGURED":
    case "AI_PROVIDER_NOT_CONFIGURED":
    case "OPENROUTER_NOT_CONFIGURED":
    case "AI_PROCESSING_UNAVAILABLE":
      return {
        title: "AI features are switched off",
        steps: [
          "Automatic categorisation and written summaries need the AI provider configured.",
          "Everything else — imports, budgets, tax estimates — works without it.",
        ],
        retryable: false,
      };
    case "PAYMENT_NOT_SUCCESSFUL":
    case "PAYMENT_DETAILS_MISSING":
    case "BILLING_NOT_CONFIGURED":
    case "NO_TERM":
    case "PAYMENT_NOT_FOUND":
      return {
        title: GENERIC.payment,
        steps: [
          "Check the card or wallet has enough balance and supports online payments.",
          "Your bank may require extra verification — approve the 3-D Secure prompt and retry.",
          "If it keeps failing, try a different payment method. You have not been charged.",
        ],
        retryable: true,
      };
    case "EMAIL_REQUIRED":
    case "EMAIL_TOOL_FAILED":
    case "EMAIL_ATTACHMENT_DOWNLOAD_FAILED":
    case "EMAIL_ALERT_PARSE_FAILED":
      return {
        title: GENERIC.email,
        steps: [
          "Confirm the connected mailbox still allows IMAP or Gmail API access in its settings.",
          "Reconnect the address from Settings › Connections if you recently changed its password.",
          "New statements are picked up automatically once access is restored.",
        ],
        action: { label: "Manage connections", href: "/settings" },
        retryable: true,
      };
    case "EMAIL_SYNC_IN_PROGRESS":
      return {
        title: "A sync is already running",
        steps: ["Let the current sync finish — it only takes a moment — then try again."],
        retryable: true,
      };
    case "ALCHEMY_UPSTREAM_ERROR":
    case "ALCHEMY_NOT_CONFIGURED":
    case "BLOCKSCOUT_NOT_CONFIGURED":
      return {
        title: GENERIC.wallet,
        steps: [
          "Check the wallet address is correct and the network (Base or Solana) is right.",
          "Public balance APIs occasionally rate-limit; retrying in a minute usually clears it.",
        ],
        retryable: true,
      };
    case "R2_NOT_CONFIGURED":
    case "R2_UPLOAD_FORBIDDEN":
    case "R2_OBJECT_UNAVAILABLE":
      return {
        title: "We couldn’t store that file",
        steps: [
          "Check the file is under 15 MB and is a PDF, CSV, XLS, XLSX, OFX or QFX file.",
          "If it’s password-protected, remove the password first — we can’t read locked files.",
        ],
        retryable: true,
      };
    case "UNSUPPORTED_FILE_TYPE":
      return {
        title: GENERIC.import,
        steps: [
          "Upload a PDF, CSV, XLS, XLSX, OFX or QFX statement.",
          "A photo of a receipt also works — take it straight from your camera roll.",
        ],
        retryable: false,
      };
    case "VALIDATION_ERROR":
    case "INVALID_CATEGORY":
    case "INVALID_BUDGET_VALUE":
      return {
        title: "Check the highlighted field",
        steps: [
          "One of the values was outside the allowed range or referenced a category that no longer exists.",
          "Reload the page to pick up your latest categories, then re-enter the value.",
        ],
        retryable: false,
      };
    case "UNAUTHENTICATED":
      return {
        title: "Your session expired",
        steps: ["Sign in again to pick up where you left off — nothing was changed."],
        retryable: true,
      };
    case "BUDGET_ALREADY_EXISTS":
      return {
        title: "That budget already exists",
        steps: ["Edit the existing budget for this category, or delete it first if you want to start over."],
        action: { label: "Open budgets", href: "/budget" },
        retryable: false,
      };
    default:
      // Network and timeout failures have no code, so infer them from the message.
      if (context === "load" && /timed out|failed to fetch|network/i.test(String(code))) {
        return {
          title: "That took too long to load",
          steps: [
            "Check your connection and try again — large year-to-date reports can be slow on the first load.",
            "Narrowing the date range also makes the report load faster.",
          ],
          retryable: true,
        };
      }
      return null;
  }
}

const CONTEXT_STEPS: Record<ErrorContext, string[]> = {
  load: ["Check your connection and try again.", "If it keeps happening, the report may be too large — try a narrower date range."],
  save: ["Your last change was not saved — nothing else was affected.", "Try again in a moment."],
  import: [
    "Check the file opens on your computer and isn’t password-protected.",
    "CSV files need a date, a description and an amount column.",
    "PDF statements are sent for secure OCR review, which can take a minute.",
  ],
  payment: ["Try a different payment method. You have not been charged."],
  email: ["Reconnect the address from Settings › Connections."],
  wallet: ["Check the address and network, then try connecting again."],
  trial: ["Upgrade to Pro to turn editing and imports back on."],
  ai: ["Everything except AI works without it."],
  rates: ["Amounts are shown unconverted for now; rates refresh hourly."],
};

/**
 * Turns any thrown value into prescriptive copy. Falls back to a short plain
 * message so genuine bugs never get a confident wrong explanation.
 */
export function guidanceFor(error: unknown, context: ErrorContext = "load"): ErrorGuidance {
  const code = error instanceof ApiError ? error.code : null;
  const mapped = byCode(code, context);
  if (mapped) return mapped;

  const message = error instanceof Error ? error.message : "";
  if (/timed out/i.test(message)) {
    return {
      title: "That took too long",
      steps: ["Check your connection and try again — the first load of a large report is the slowest."],
      retryable: true,
    };
  }
  return {
    title: GENERIC[context],
    steps: CONTEXT_STEPS[context],
    retryable: context === "load" || context === "save",
  };
}

/** Renders steps as a single readable line for toasts and inline alerts. */
export function guidanceText(guidance: ErrorGuidance): string {
  return guidance.steps.join(" ");
}
