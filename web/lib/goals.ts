export type GoalFundingSource = "wallet" | "account" | "income-rule";
export type GoalStatus = "active" | "ready" | "archived";

export interface GoalContribution {
  id: string;
  date: string;
  name: string;
  amount: number;
}

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  target: number;
  tracked: number;
  source: string;
  fundingSource: GoalFundingSource;
  targetDate?: string;
  monthlyRate: number;
  status: GoalStatus;
  paused?: boolean;
  reactivateOnSpend: boolean;
  contributions: GoalContribution[];
}

export const INITIAL_GOALS: Goal[] = [
  {
    id: "tax-reserve",
    name: "Tax Reserve",
    emoji: "🧾",
    target: 24000,
    tracked: 12180,
    source: "Main wallet + Business account",
    fundingSource: "wallet",
    targetDate: "2026-12-31",
    monthlyRate: 2150,
    status: "active",
    reactivateOnSpend: true,
    contributions: [
      { id: "tax-1", date: "2026-09-16", name: "Invoice #0192 allocation", amount: 720 },
      { id: "tax-2", date: "2026-09-08", name: "Freelance payout allocation", amount: 555 },
      { id: "tax-3", date: "2026-08-29", name: "Business account transfer", amount: 875 },
    ],
  },
  {
    id: "buffer",
    name: "Emergency Buffer",
    emoji: "🛟",
    target: 10000,
    tracked: 6840,
    source: "Main wallet",
    fundingSource: "wallet",
    monthlyRate: 840,
    status: "active",
    reactivateOnSpend: true,
    contributions: [
      { id: "buffer-1", date: "2026-09-12", name: "Wallet transfer", amount: 280 },
      { id: "buffer-2", date: "2026-08-31", name: "Monthly balance sweep", amount: 560 },
    ],
  },
  {
    id: "equipment",
    name: "Equipment Fund",
    emoji: "💻",
    target: 2400,
    tracked: 2400,
    source: "Business account",
    fundingSource: "account",
    monthlyRate: 400,
    status: "ready",
    reactivateOnSpend: true,
    contributions: [
      { id: "equipment-1", date: "2026-09-04", name: "Client payment allocation", amount: 400 },
    ],
  },
  {
    id: "vacation",
    name: "Summer Vacation",
    emoji: "🌴",
    target: 3200,
    tracked: 3200,
    source: "Main wallet",
    fundingSource: "wallet",
    monthlyRate: 0,
    status: "archived",
    reactivateOnSpend: false,
    contributions: [],
  },
];
