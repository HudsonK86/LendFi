import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { AppHeader } from "@/components/AppHeader";
import { Web3ContextProvider } from "@/context/web3";
import { getInitialStateFromCookies } from "@/context/web3-server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "LendFi",
  description: "Shared-pool lending — supply liquidity, borrow with ETH collateral, monitor risk.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const initialState = getInitialStateFromCookies(headerStore.get("cookie"));

  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen antialiased">
        <Web3ContextProvider initialState={initialState}>
          <div className="flex min-h-screen flex-col">
            <AppHeader />
            <div className="flex-1">{children}</div>
            <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
              LendFi · Shared-pool lending protocol
            </footer>
          </div>
          <ToastContainer position="bottom-right" theme="dark" autoClose={3500} />
        </Web3ContextProvider>
      </body>
    </html>
  );
}
