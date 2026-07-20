import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Space_Grotesk,
  Plus_Jakarta_Sans,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import BackendWarmup from "@/components/BackendWarmup";

// ── Redesign type system ────────────────────────────────────────────────────
// Editorial serif display + clean sans body + mono for all numbers/prices.
const displaySerif = Instrument_Serif({
  variable: "--font-instrument",
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

const bodySans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const numericMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bullseye AI",
  description: "AI-powered stock analysis and trading research dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displaySerif.variable} ${bodySans.variable} ${numericMono.variable} ${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      <head>
        {/* Start the Google Fonts connection early — the pages still load the
            font CSS via @import (Space Grotesk / JetBrains Mono / Inter), and
            preconnect shaves the connection setup off that fetch. Additive and
            safe: it changes no rendering, only warms the connection. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <BackendWarmup />
      </body>
    </html>
  );
}
