import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { LandingNav } from "@/components/landing/landing-nav";
import { PricingCard } from "@/components/landing/pricing-card";
import { CheckIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Dobby — Bookkeeping that keeps itself up to date",
  description:
    "Income, expenses, stablecoins and tax readiness in one calm workspace. Import statements, connect your email, track wallets — Dobby categorises everything and asks only when it is unsure.",
};

/**
 * Landing page — rebuilt from the Asset (asset.framer.ai) template structure:
 * nav → hero → feature grid → feature list rows → pricing → footer. The
 * template's look (oversized display headline, eyebrow labels, hairline
 * grid, quiet neutral surfaces) is reproduced on the Rift Labs token system
 * instead of its palette, so the page and the app it advertises read as one
 * product. No FAQ/accordion per product decision; a single Pro plan, told
 * in three cards rather than three tiers.
 */

/* ————————————————————————————————————————————————————————————— */
/* Shared primitives                                              */
/* ————————————————————————————————————————————————————————————— */

function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className ?? ""}`}>{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">{children}</p>
  );
}

function SectionHead({
  eyebrow,
  title,
  sub,
  center = true,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-3 ${center ? "items-center text-center" : "items-start"}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="m-0 max-w-xl text-balance text-[28px] font-medium leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[34px]">
        {title}
      </h2>
      {sub ? (
        <p className="m-0 max-w-md text-pretty text-[14px] leading-relaxed text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center rounded-[50px] bg-primary px-5 text-[13px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      {children}
    </Link>
  );
}

function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-1.5 rounded-[50px] border border-line bg-card px-5 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      {children}
    </Link>
  );
}

/* ————————————————————————————————————————————————————————————— */
/* Hero                                                           */
/* ————————————————————————————————————————————————————————————— */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* One faint brand wash behind the headline — the template's only
          decorative gradient, kept at whisper level to stay inside the
          "no decorative gradients" rule. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-token)_0%,transparent_70%)] opacity-[0.07]"
      />
      <Container className="flex flex-col pb-16 pt-24 sm:pb-24 sm:pt-32">
        <div className="mx-auto flex w-full max-w-3xl flex-col text-left">
          <h1 className="m-0 text-balance text-[48px] font-normal leading-[1.1] tracking-[-0.03em] text-foreground">
            Know what you owe. Before the deadline does
          </h1>
          <p className="m-0 mt-5 max-w-xl text-pretty text-[16px] font-normal leading-relaxed text-muted-foreground">
            Bookkeeping that keeps your records in order and tells you exactly where you stand for tax season. No spreadsheets, no scramble in March.
          </p>
          <div className="mt-[73px]">
            <PrimaryCta href="/sign-up">Start free trial</PrimaryCta>
          </div>
          <p className="m-0 mt-3 text-[12px] text-faint">No card required — cancel anytime during the trial.</p>
        </div>
        {/* Product frame: the real dashboard is the hero image — one
          screenshot per theme, so light and dark each match the page. */}
        {/* 64px between the CTA and the screenshot, including the microcopy line */}
        <div className="mt-[33px] w-full">
          <div
            className="overflow-hidden rounded-xl border border-line/60 bg-card"
            style={{
              maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
            }}
          >
            <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-paper-200" />
              <span aria-hidden="true" className="size-2.5 rounded-full bg-paper-200" />
              <span aria-hidden="true" className="size-2.5 rounded-full bg-paper-200" />
            </div>
            <Image
              src="/dashboard-light.png"
              alt="The Dobby dashboard — income versus expenses, tax insights, proactive flags and everything that needs attention"
              width={2304}
              height={1160}
              priority
              sizes="(min-width: 1152px) 1152px, 100vw"
              className="block h-auto w-full dark:hidden"
            />
            <Image
              src="/dashboard-dark.png"
              alt=""
              aria-hidden="true"
              width={2304}
              height={1160}
              priority
              sizes="(min-width: 1152px) 1152px, 100vw"
              className="hidden h-auto w-full dark:block"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ————————————————————————————————————————————————————————————— */
/* Features — bento grid + feature list rows                      */
/* ————————————————————————————————————————————————————————————— */

const FEATURE_ROWS: { title: string; body: string; points: string[] }[] = [
  {
    title: "Every transaction, in its place",
    body: "Dobby categorises continuously and queues only what it is unsure about. Approve once — the rule applies from then on.",
    points: ["Statement, email and wallet imports", "Review queue for ambiguous items", "Rules that remember your choices"],
  },
  {
    title: "Income tracked in stablecoins",
    body: "Connect a Base or Solana address and stablecoin income is tracked beside your bank accounts — holdings, income and spend in USDC, USDT and CNGN only.",
    points: ["USDC, USDT and CNGN balances", "Stablecoin-only income and spend", "Net worth includes wallet holdings"],
  },
  {
    title: "Ready before tax season",
    body: "Taxable versus non-taxable stays tagged all year, with deductions surfaced as they appear. Advisory only — Dobby never prepares or files returns.",
    points: ["Taxable/non-tax tagging", "Deduction flags on real spending", "Monthly tax reminders"],
  },
];

const MOCK_ROWS: { label: string; detail: string; amount: string; tone?: "in" }[][] = [
  [
    { label: "Salary — March", detail: "Categorized · Income", amount: "+$4,200.00", tone: "in" },
    { label: "Figma subscription", detail: "Categorized · Software", amount: "−$15.00" },
    { label: "Unmatched transfer", detail: "Needs your review", amount: "−$120.00" },
  ],
  [
    { label: "USDC payout", detail: "Base · Coinbase", amount: "+1,250 USDC", tone: "in" },
    { label: "USDT received", detail: "Solana · unknown sender", amount: "+500 USDT" },
    { label: "CNGN spend", detail: "Categorized · Groceries", amount: "−2,400 CNGN" },
  ],
  [
    { label: "Taxable income YTD", detail: "Tagged automatically", amount: "$18,940", tone: "in" },
    { label: "Deduction flag", detail: "Home office · review", amount: "$310" },
    { label: "Next reminder", detail: "Quarterly estimate", amount: "Apr 15" },
  ],
];

function Features() {
  return (
    <section id="features" className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-[60px] py-20 sm:py-28">
        <div className="flex flex-col items-start gap-4 text-left">
          <p className="m-0 text-[14px] font-normal text-faint">Financial intelligence</p>
          <h2 className="m-0 max-w-xl text-balance text-[38px] font-normal leading-[1.15] tracking-[-0.02em] text-foreground">
            Everything you need to stay on top of your money
          </h2>
          <p className="m-0 max-w-md text-pretty text-[16px] font-normal leading-relaxed text-muted-foreground">
            From everyday bookkeeping to tax season handled automatically, so you're never caught off guard
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {FEATURE_ROWS.map((row, index) => (
            <div
              key={row.title}
              className={`grid grid-cols-1 items-center gap-8 p-8 sm:gap-12 lg:grid-cols-2 lg:p-12 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <div className="flex flex-col items-start gap-4">
                <h3 className="m-0 text-balance text-[22px] font-medium leading-snug tracking-[-0.01em] text-foreground sm:text-[26px]">
                  {row.title}
                </h3>
                <p className="m-0 text-[14px] leading-relaxed text-muted-foreground">{row.body}</p>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {row.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-[13px] text-foreground">
                      <span aria-hidden="true" className="flex size-4 items-center justify-center rounded-full bg-success-soft text-success">
                        <CheckIcon />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="overflow-hidden rounded-xl border border-line bg-card">
                <div className="border-b border-line px-4 py-3 text-[12px] font-medium text-muted-foreground">
                  {row.points[0]}
                </div>
                <div className="flex flex-col gap-2.5 p-4">
                  {MOCK_ROWS[index].map((mock) => (
                    <div key={mock.label} className="flex items-center justify-between rounded-lg bg-muted/60 px-3.5 py-3">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-md bg-paper-200/60">
                          <span className="size-2 rounded-full bg-paper-200" />
                        </span>
                        <span className="flex flex-col">
                          <span className="text-[12px] font-medium text-foreground">{mock.label}</span>
                          <span className="text-[11px] text-muted-foreground">{mock.detail}</span>
                        </span>
                      </span>
                      <span className={`text-[12px] font-medium tabular-nums ${mock.tone === "in" ? "text-success" : "text-foreground"}`}>
                        {mock.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ————————————————————————————————————————————————————————————— */
/* Shared primitives                                              */
/* ————————————————————————————————————————————————————————————— */

function Pricing() {
  return (
    <section id="pricing" className="border-t border-line">
      <Container className="flex flex-col gap-12 py-20 sm:py-28">
        <SectionHead
          eyebrow="Pricing"
          title="Start free. Upgrade when you need more."
          sub="Free forever for imports, categorization and your ledger. Pro adds email auto-fetch, stablecoin wallets, proactive flags and tax advisory."
        />
        <PricingCard />
        <p className="m-0 text-center text-[12px] text-faint">
          Pay by card or crypto — your payment method is chosen inside checkout. Dobby Pro starts with a
          7-day free trial. When a subscription ends, your ledger and history stay exactly as they are — the
          workspace goes view-only, nothing is deleted.
        </p>
      </Container>
    </section>
  );
}

/* ————————————————————————————————————————————————————————————— */
/* Page                                                           */
/* ————————————————————————————————————————————————————————————— */

export default async function LandingPage() {
  // Belt-and-braces for direct hits to `/`: the marketing layout already
  // bounces signed-in users to /app before this renders.
  const { userId } = await auth();
  if (userId) return null;

  return (
    <div id="top" className="min-h-dvh bg-[#080A09]" style={{ ["--background" as string]: "#080A09" }}>
      <LandingNav />
      <main id="main">
        <Hero />
        <Features />
        <Pricing />
      </main>
    </div>
  );
}
