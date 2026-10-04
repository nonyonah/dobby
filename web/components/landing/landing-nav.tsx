"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";

/**
 * Landing navigation. Transparent over the hero, gains the shell surface +
 * hairline bottom border once the page scrolls (the template's floating-bar
 * behaviour, translated to Rift's flat, opaque surfaces). Never translucent:
 * scrolled content must not bleed through, matching the top bar rule.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors ${
        scrolled ? "border-line bg-background" : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded outline-none focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          <BrandLogo size={24} />
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">Dobby</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden rounded-[10px] px-3 py-2 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center rounded-[10px] bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
