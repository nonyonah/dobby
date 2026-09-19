import type { Metadata } from "next";
import { Google_Sans_Flex, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const googleSansFlex = Google_Sans_Flex({
  variable: "--font-sans-flex",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html lang="en" className={`${googleSansFlex.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
