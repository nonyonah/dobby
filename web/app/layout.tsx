import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeSync } from "@/components/theme-sync";
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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col"><ThemeSync />{children}</body>
    </html>
  );
}
