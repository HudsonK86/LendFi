import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppHeader } from "@/components/AppHeader";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "LendFi",
  description: "Shared-pool lending — supply liquidity, borrow with ETH collateral, monitor risk.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <AppHeader />
            <div className="flex-1">{children}</div>
            <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
              LendFi · Shared-pool lending protocol
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
