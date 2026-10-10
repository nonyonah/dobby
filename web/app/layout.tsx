import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { Inter } from "next/font/google";
import { ThemeSync } from "@/components/theme-sync";
import { PageViewTracker } from "@/components/page-view-tracker";
import { UserbackProvider } from "@/components/userback";
import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";
import { Analytics } from "@vercel/analytics/next";
// driver.css carries the functional baseline the library depends on:
// `position: fixed` on the popover (driver.js writes `left/top/right/bottom`
// inline and they do nothing without it), the z-index above the app shell,
// `pointer-events: none` on the page so the tour is modal, and the arrow
// geometry. Those are mechanics, not style, so they are imported rather than
// reimplemented. Imported before globals.css so the token-based overrides at the
// bottom of globals.css win on equal specificity.
import "driver.js/dist/driver.css";
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
      {/* Dark is class-driven, not a media query, so the palette ships light by
          default and the script above decides the real one before paint. */}
      <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
        <body className="relative min-h-full flex flex-col">
          {/* Must be `next/script`, not a raw <script> element: React never
              executes a <script> rendered inside a component on the client
              ("Encountered a script tag while rendering React component"), so
              the raw version silently never ran. beforeInteractive puts it in
              the document head during SSR, ahead of first paint. */}
          <Script id="dobby-theme-boot" strategy="beforeInteractive">
            {`(function(){try{var k="dobby-theme",s=localStorage.getItem(k);
var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.classList.toggle("dark",d);r.dataset.theme=d?"dark":"light";}catch(e){}})();`}
          </Script>
          <UserbackProvider>
          <ThemeSync />
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
