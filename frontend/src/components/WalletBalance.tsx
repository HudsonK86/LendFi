"use client";

import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";

export function WalletBalance() {
  const { address, isConnected } = useAccount();
  const { data } = useBalance({ address, query: { enabled: Boolean(address) } });

  if (!isConnected || !data) return null;
  return (
    <span className="hidden rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1 font-mono text-xs text-slate-200 sm:inline-block">
      {Number(formatUnits(data.value, data.decimals)).toFixed(4)} {data.symbol}
    </span>
  );
}
