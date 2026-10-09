import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { LandingNav } from "@/components/landing/landing-nav";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PricingCard } from "@/components/landing/pricing-card";
import { FeatureAccordion } from "@/components/landing/feature-accordion";
import { Reveal } from "@/components/landing/reveal";
import { XIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Dobby",
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
        <Reveal delay={0.1} className="mx-auto flex w-full max-w-3xl flex-col text-left">
          <h1 className="m-0 text-balance text-[32px] font-normal sm:text-[48px] leading-[1.1] tracking-[-0.03em] text-foreground">
            Know what you owe. Before the deadline does
          </h1>
          <p className="m-0 mt-5 max-w-xl text-pretty text-[14px] font-normal leading-relaxed text-muted-foreground sm:text-[16px]">
            Bookkeeping that keeps your records in order and tells you exactly where you stand for tax season. No spreadsheets, no scramble in March.
          </p>
          <div className="mt-5">
            <PrimaryCta href="/sign-up">Start free trial</PrimaryCta>
          </div>
          <p className="m-0 mt-3 text-[12px] text-faint">No card required — cancel anytime during the trial.</p>
        </Reveal>
        {/* Product frame: the real dashboard is the hero image — one
          screenshot per theme, so light and dark each match the page. */}
        
        <Reveal delay={0.2} className="mt-5 w-full">
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
        </Reveal>
      </Container>
    </section>
  );
}

/* ————————————————————————————————————————————————————————————— */
/* Features — bento grid + feature list rows                      */
/* ————————————————————————————————————————————————————————————— */

function Features() {
  return (
    <section id="features">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 sm:gap-16 sm:px-[60px] py-12 sm:py-16">
        <Reveal delay={0.1} className="flex flex-col items-start gap-4 text-left">
          <p className="m-0 text-[14px] font-normal text-faint">Financial intelligence</p>
          <h2 className="m-0 max-w-xl text-balance text-[28px] font-normal sm:text-[38px] leading-[1.15] tracking-[-0.02em] text-foreground">
            Everything you need to stay on top of your money
          </h2>
          <p className="m-0 max-w-md text-pretty text-[14px] font-normal sm:text-[16px] leading-relaxed text-muted-foreground">
            From everyday bookkeeping to tax season handled automatically, so you're never caught off guard
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <FeatureAccordion />
        </Reveal>
      </div>
    </section>
  );
}

/* ————————————————————————————————————————————————————————————— */
/* Shared primitives                                              */
/* ————————————————————————————————————————————————————————————— */

function Pricing() {
  return (
    <section id="pricing">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 sm:gap-12 sm:px-[60px] py-12 sm:py-16">
        <Reveal delay={0.1} className="flex h-auto w-full sm:h-[151.5px] sm:w-[480px] flex-col items-start gap-4 text-left">
          <p className="m-0 text-[14px] font-normal text-faint">Transparent pricing</p>
          <h2 className="m-0 w-full text-[28px] font-normal sm:text-[38px] leading-[1.15] tracking-[-0.02em] text-foreground">
            Try everything, free for 7 days
          </h2>
          <p className="m-0 w-full text-pretty text-[14px] font-normal sm:text-[16px] leading-relaxed text-muted-foreground">
            No card required. See exactly what it's like to never scramble for your records again.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <PricingCard />
        </Reveal>
        <p className="m-0 text-center text-[12px] text-faint">
          Pay by card, billed in your local currency inside checkout. Dobby Pro starts with a 7-day free
          trial. When a subscription ends, your ledger and history stay exactly as they are — the workspace
          goes view-only, nothing is deleted.
        </p>
      </div>
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
      <footer className="min-h-[216.5px] py-12 sm:h-[216.5px] sm:py-0 bg-[#131517]">
        <Reveal className="mx-auto flex h-full w-full max-w-6xl flex-col items-start justify-center gap-8 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-[60px]">
          <div className="flex flex-col items-start gap-10 sm:gap-[68px]">
            <Link href="/" className="flex items-center gap-2">
              <BrandLogo size={24} />
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">Dobby</span>
            </Link>
            <p className="m-0 text-[12px] text-faint">©2026 Rift Labs - All rights reserved.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-col items-start gap-3">
            <Link href="/" className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">Home</Link>
            <Link href="#features" className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">Features</Link>
            <Link href="#pricing" className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground">Pricing</Link>
            {/* The founder's X handle, so a question can reach a person rather than
                a shared support inbox. Opens in a new tab because a same-tab
                navigation to x.com would strand the visitor away from the app. */}
            <a
              href="https://x.com/its_nonsoo"
              target="_blank"
              rel="noopener noreferrer me"
              className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <XIcon className="size-3.5 shrink-0" aria-hidden="true" />
              Contact
            </a>
          </nav>
        </Reveal>
      </footer>
    </div>
  );
}
