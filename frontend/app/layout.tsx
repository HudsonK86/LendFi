import type { Metadata } from "next";
import Link from "next/link";
import { WalletBalance } from "@/components/WalletBalance";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "LendFi",
  description: "MVP lending demo"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-5">
                <Link href="/" className="text-lg font-semibold">
                  LendFi
                </Link>
                <nav className="flex items-center gap-3 text-sm text-neutral-700">
                  <Link href="/pool" className="hover:text-neutral-900">
                    Pool
                  </Link>
                  <Link href="/borrow" className="hover:text-neutral-900">
                    Borrow
                  </Link>
                  <Link href="/dashboard" className="hover:text-neutral-900">
                    Dashboard
                  </Link>
                  <Link href="/liquidations" className="hover:text-neutral-900">
                    Liquidations
                  </Link>
                  <Link href="/admin" className="hover:text-neutral-900">
                    Admin
                  </Link>
                </nav>
              </div>
              <div className="flex items-center gap-2">
                <WalletBalance />
                <WalletConnectButton />
              </div>
            </div>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}

