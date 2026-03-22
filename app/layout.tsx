import type React from "react";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Suspense } from "react";
import "./globals.css";

// Import Providers - now with SSR enabled since we handle build-time gracefully
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Numo: Frontier FX Hedging",
  description:
    "Protect your business from currency volatility in emerging markets.",
  icons: {
    icon: "/site-favicon.ico",
    shortcut: "/site-favicon.ico",
    apple: [
      {
        sizes: "180x180",
        type: "image/png",
        url: "/apple-touch-icon.png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <Providers>
          <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
        </Providers>
      </body>
    </html>
  );
}
