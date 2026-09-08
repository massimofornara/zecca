import type { Metadata } from "next";
import { Cinzel, Cinzel_Decorative, Source_Serif_4, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mark = Cinzel_Decorative({
  variable: "--font-mark",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ledger = IBM_Plex_Mono({
  variable: "--font-ledger",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Zecca — conio e bottega",
    template: "%s · Zecca",
  },
  description:
    "La zecca conia i crediti. Tu li compri, li spendi in bottega su oggetti della casa, e puoi prelevarli verso un conto o un wallet.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      className={`dark ${cinzel.variable} ${mark.variable} ${serif.variable} ${ledger.variable} h-full`}
    >
      <body className="grain min-h-full flex flex-col">
        {children}
        <Toaster theme="dark" position="top-center" />
      </body>
    </html>
  );
}
