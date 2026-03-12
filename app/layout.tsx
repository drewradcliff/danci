import type { Metadata } from "next";
import {
  Dancing_Script,
  Fraunces,
  Geist,
  Geist_Mono,
  Manrope,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const headlineFont = Fraunces({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-signin-headline",
});

const bodyFont = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-signin-body",
});

const scriptFont = Dancing_Script({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-signin-script",
});

export const metadata: Metadata = {
  title: "danci",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${headlineFont.variable} ${bodyFont.variable} ${scriptFont.variable} antialiased`}
      >
        <QueryProvider>{children}</QueryProvider>
        <Analytics />
      </body>
    </html>
  );
}
