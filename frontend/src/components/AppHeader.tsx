"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useChainId } from "wagmi";

import { WalletBalance } from "@/components/WalletBalance";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { cn } from "@/lib/ui";

const nav = [
  { href: "/", label: "Home" },
  { href: "/pool", label: "Pool" },
  { href: "/borrow", label: "Borrow" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/liquidations", label: "Liquidations" },
  { href: "/admin", label: "Admin" },
] as const;

function NetworkBadge() {
  const chainId = useChainId();
  const { isConnected } = useAccount();

  const label =
    chainId === 31337
      ? "Hardhat Local"
      : chainId === 1
        ? "Ethereum"
        : `Chain ${chainId}`;

  return (
    <span
      className={cn(
        "hidden items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex",
        isConnected
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
          : "border-slate-600/80 bg-slate-800/60 text-slate-400",
      )}
      title="Connected network"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {label}
    </span>
  );
}

export function AppHeader() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Link href="/" className="group flex shrink-0 items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-700 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-900/40">
              L
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-50">
              Lend<span className="text-cyan-400">Fi</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  isActive(item.href)
                    ? "bg-slate-800/90 text-cyan-300"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <NetworkBadge />
          <WalletBalance />
          <WalletConnectButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-slate-800/60 px-4 py-2 md:hidden">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium",
              isActive(item.href) ? "bg-slate-800 text-cyan-300" : "text-slate-400",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
