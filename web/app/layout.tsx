import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { Inter } from "next/font/google";
import { AccentSync } from "@/components/accent-sync";
import { PageViewTracker } from "@/components/page-view-tracker";
import { UserbackProvider } from "@/components/userback";
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Dobby",
    template: "%s | Dobby",
  },
  description:
    "Income, expenses, stablecoins and tax readiness in one calm workspace.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      {/* Permanent dark mode. The class and the HeroUI attribute are stamped
          here at render time — no stored preference, no inline script, no
          first-paint flash: the server sends the page already dark. */}
      <html lang="en" className={`${inter.variable} h-full antialiased dark`} data-theme="dark">
        <body className="relative min-h-full flex flex-col">
          <UserbackProvider>
          <AccentSync />
        <PageViewTracker />
          {/* coss toasts are mounted by their providers rather than by a
              separate <Toaster/>, so they wrap the app instead of sitting
              beside it. Anchored goes inside plain: both declare a
              `Toast.Provider` and only the outer one needs to own the page. */}
          <ToastProvider>
            <AnchoredToastProvider>
              {/* Base UI needs its own stacking context so portaled overlays
                  (Dialog, Popover, Select) always paint above page content.
                  `position: relative` keeps backdrops covering the visual
                  viewport on iOS Safari 26+. */}
              <div className="isolate relative flex min-h-full flex-col">{children}</div>
              {/* PostHog is not fetched until this is accepted, so the banner
                  is the only thing that exists before consent. */}
            </AnchoredToastProvider>
          </ToastProvider>
          </UserbackProvider>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
