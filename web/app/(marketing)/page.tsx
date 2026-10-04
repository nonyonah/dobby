import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LandingNav } from "@/components/landing/landing-nav";
import { PricingCard } from "@/components/landing/pricing-card";
import {
  CardIcon,
  CheckIcon,
  EmailIcon,
  FileIcon,
  ReceiptIcon,
  TrendUpIcon,
  WalletIcon,
} from "@/components/icons";

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
      className="inline-flex h-10 items-center rounded-[10px] bg-primary px-5 text-[13px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      {children}
    </Link>
  );
}

function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-line bg-card px-5 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
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
      <Container className="flex flex-col items-center pb-16 pt-24 text-center sm:pb-24 sm:pt-32">
        <h1 className="m-0 max-w-3xl text-balance text-[40px] font-medium leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[64px]">
          Bookkeeping that keeps itself up to date
        </h1>
        <p className="m-0 mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground sm:text-[16px]">
          Dobby turns statements, emails and wallets into a categorised ledger —
          then keeps income, spending and tax readiness current without the
          spreadsheet work.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta href="/sign-up">Start free — 7-day trial</PrimaryCta>
          <SecondaryCta href="/sign-in">Sign in</SecondaryCta>
        </div>
        {/* Product frame: the real dashboard is the hero image — one
            screenshot per theme, so light and dark each match the page. */}
        <div className="mt-14 w-full sm:mt-20">
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_48px_rgb(0_0_0/0.06)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_16px_48px_rgb(0_0_0/0.35)]">
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
              loading="eager"
              sizes="(min-width: 1152px) 1152px, 100vw"
              className="block h-auto w-full dark:hidden"
            />
            <Image
              src="/dashboard-dark.png"
              alt=""
              aria-hidden="true"
              width={2304}
              height={1160}
              loading="eager"
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

const FEATURES: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}[] = [
  {
    icon: FileIcon,
    title: "Import anything",
    body: "Bank statements, OFX, receipts and manual entries land in one ledger.",
  },
  {
    icon: EmailIcon,
    title: "Email auto-fetch",
    body: "Connect Gmail or Outlook and transaction alerts file themselves.",
  },
  {
    icon: WalletIcon,
    title: "Wallet tracking",
    body: "Follow Base and Solana addresses alongside bank accounts.",
  },
  {
    icon: ReceiptIcon,
    title: "Categorised for you",
    body: "Dobby categorises every transaction and flags only the unsure ones.",
  },
  {
    icon: TrendUpIcon,
    title: "Insights that explain",
    body: "Net income, cash flow and tax position in plain language.",
  },
  {
    icon: CardIcon,
    title: "Tax readiness",
    body: "Deduction flags and checklists keep you ready — never a filing service.",
  },
];

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

function Features() {
  return (
    <section className="border-t border-line">
      <Container className="flex flex-col gap-16 py-20 sm:py-28">
        <SectionHead
          eyebrow="The workspace"
          title="Everything your money is doing, in one calm place"
          sub="No spreadsheets to reconcile, no alerts to chase. Dobby keeps the ledger current so you can decide with context."
        />
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex flex-col gap-2 bg-card p-6">
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <feature.icon className="size-4" />
              </span>
              <h3 className="m-0 text-[14px] font-semibold text-foreground">{feature.title}</h3>
              <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-10 sm:gap-14">
          {FEATURE_ROWS.map((row, index) => (
            <div
              key={row.title}
              className={`grid grid-cols-1 items-center gap-6 border-t border-line pt-10 sm:gap-12 lg:grid-cols-2 lg:pt-14 ${
                index % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
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
              {/* Feature visual: quiet mock panel. */}
              <div className="overflow-hidden rounded-xl border border-line bg-card">
                <div className="border-b border-line px-4 py-3 text-[12px] font-medium text-muted-foreground">
                  {row.points[0]}
                </div>
                <div className="flex flex-col gap-2.5 p-4">
                  {[0, 1, 2].map((rowIndex) => (
                    <div key={rowIndex} className="flex items-center justify-between rounded-lg bg-muted/60 px-3.5 py-3">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="size-6 rounded-md bg-paper-200" />
                        <span className="flex flex-col gap-1">
                          <span aria-hidden="true" className="h-2 w-20 rounded-full bg-paper-200 sm:w-28" />
                          <span aria-hidden="true" className="h-2 w-12 rounded-full bg-paper-200/70 sm:w-16" />
                        </span>
                      </span>
                      <span aria-hidden="true" className="h-2 w-10 rounded-full bg-paper-200" />
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
/* Pricing — one Pro card, segmented monthly/annual picker             */
/* ————————————————————————————————————————————————————————————— */

function Pricing() {
  return (
    <section className="border-t border-line">
      <Container className="flex flex-col gap-12 py-20 sm:py-28">
        <SectionHead
          eyebrow="Pricing"
          title="One plan. Every feature."
          sub="Dobby Pro unlocks the whole workspace — email auto-fetch, wallet tracking, net worth, proactive flags and monthly tax reminders."
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
/* Footer                                                         */
/* ————————————————————————————————————————————————————————————— */

function Footer() {
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-8 py-12">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={28} />
            <div>
              <p className="m-0 text-[13px] font-semibold text-foreground">Dobby</p>
              <p className="m-0 text-[12px] text-muted-foreground">Personal finance and bookkeeping</p>
            </div>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link
              href="/sign-in"
              className="text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              Create account
            </Link>
            <a
              href="mailto:support@riftlabs.xyz"
              className="text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              Support
            </a>
          </nav>
        </div>
        <div className="flex flex-col justify-between gap-2 border-t border-line pt-6 sm:flex-row">
          <p className="m-0 text-[12px] text-faint">
            © {new Date().getFullYear()} Rift Labs. Advisory estimates only — Dobby does not prepare or file
            tax returns.
          </p>
          <p className="m-0 text-[12px] text-faint">Built for calm books.</p>
        </div>
      </Container>
    </footer>
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
    <div className="min-h-dvh bg-background">
      <LandingNav />
      <main id="main">
        <Hero />
        <Features />
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}
