import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import { ThemeSync } from "@/components/theme-sync";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dobby — Income overview",
  description:
    "Rift Labs income, expenses and taxable income dashboard. shadcn/ui patterns with Rift Labs tokens.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <head>
        {/*
          Sets the theme class before first paint. React hydration happens well
          after first paint, so without this a visitor whose stored preference
          differs from the OS scheme would see a full-page light flash.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem("dobby-theme");if(p!=="light"&&p!=="dark"){p="system"}var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.setAttribute("data-theme",d?"dark":"light")}catch(e){}})();`,
          }}
        />
      </head>
      <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
        <body className="min-h-full flex flex-col"><ThemeSync /><Toaster />{children}</body>
      </html>
    </ClerkProvider>
  );
}
