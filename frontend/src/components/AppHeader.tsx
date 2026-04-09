"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";

import { WalletConnectButton } from "@/components/WalletConnectButton";
import { cn } from "@/lib/ui";

const configuredAdminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS as string | undefined;

const baseNav = [
  { href: "/", label: "Home" },
  { href: "/protocol", label: "Protocol" },
  { href: "/pool", label: "Pool" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

const adminNavItem = { href: "/admin", label: "Admin" } as const;

/** Show Admin in the nav only when the connected wallet matches the configured admin address. */
function useShowAdminInNav() {
  const { address, isConnected } = useAccount();

  return useMemo(() => {
    if (!configuredAdminWallet || !isAddress(configuredAdminWallet)) {
      // No admin address in env — keep link visible so local setups without env still work.
      return true;
    }
    return Boolean(isConnected && address?.toLowerCase() === configuredAdminWallet.toLowerCase());
  }, [address, isConnected]);
}

export function AppHeader() {
  const pathname = usePathname();
  const showAdminInNav = useShowAdminInNav();

  const nav = useMemo(
    () => (showAdminInNav ? [...baseNav, adminNavItem] : [...baseNav]),
    [showAdminInNav],
  );

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
        <div className="flex shrink-0 items-center">
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
