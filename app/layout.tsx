import type { Metadata } from "next";
import { DM_Serif_Display, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import "./globals.css";

const serif = DM_Serif_Display({
  weight: "400",
  variable: "--font-dm-serif",
  subsets: ["latin", "latin-ext"],
});

const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin", "latin-ext"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "LangSafe LingHacks — AI Language Preservation",
  description:
    "A LingHacks VII edition of LangSafe: autonomous AI agents, community verification, and lesson generation for endangered language preservation.",
  keywords: [
    "endangered languages",
    "language preservation",
    "linguistic diversity",
    "AI agents",
    "NLP",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${serif.variable} ${sans.variable} ${mono.variable} font-sans antialiased`}
      >
        {children}
        <CommandPalette />
      </body>
    </html>
  );
}
