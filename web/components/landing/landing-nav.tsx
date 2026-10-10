"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { CancelIcon, Menu01Icon } from "@hugeicons/core-free-icons";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggleButton } from "@/components/theme-control";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
];

/**
 * Landing navigation. Transparent over the hero, gains the shell surface +
 * hairline bottom border once the page scrolls (the template's floating-bar
 * behaviour, translated to Rift's flat, opaque surfaces). Never translucent:
 * scrolled content must not bleed through, matching the top bar rule.
 *
 * Below `sm` the inline links cannot fit, so they collapse into a hamburger
 * panel with the CTA underneath — the links and "Get started" are the whole
 * navigation, and dropping the links on a phone left a header with nothing in
 * it but one button.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes, matching the panel's role="dialog" behaviour.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The links are in-page anchors, so following one has to close the panel or
  // it stays open over the section the visitor just jumped to.
  const go = (href: string) => {
    setOpen(false);
    if (!href.startsWith("#")) return;
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors ${
        scrolled ? "border-line bg-background" : "border-transparent bg-transparent"
      }`}
    >
      <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <BrandLogo size={24} />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">Dobby</span>
        </Link>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 sm:flex">
          {LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="rounded-[10px] px-3 py-2 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 sm:flex">
          <ThemeToggleButton />
          <Link
            href="/sign-up"
            className="inline-flex items-center rounded-[50px] bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Get started
          </Link>
        </div>

        {/* Mobile: the theme toggle stays in the bar, the rest lives behind the
            hamburger. */}
        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggleButton />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="landing-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-[50px] border border-line bg-card text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            <HugeiconsIcon icon={open ? CancelIcon : Menu01Icon} size={16} aria-hidden="true" strokeWidth={2} />
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="landing-mobile-menu"
          role="dialog"
          aria-label="Menu"
          className="border-t border-line bg-background px-5 pb-4 pt-2 sm:hidden"
        >
          <nav className="flex flex-col">
            {LINKS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(event) => {
                  if (item.href.startsWith("#")) event.preventDefault();
                  go(item.href);
                }}
                className="rounded-[10px] px-2 py-2.5 text-[14px] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              >
                {item.label}
              </a>
            ))}
          </nav>
          {/* Nearly the full panel width, so the primary action reads as the
              same weight in the bar and in the menu. */}
          <Link
            href="/sign-up"
            onClick={() => setOpen(false)}
            className="mt-2 flex w-[calc(100%-0.5rem)] items-center justify-center rounded-[50px] bg-primary py-2.5 text-[14px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Get started
          </Link>
        </div>
      ) : null}
    </header>
  );
}