"use client";

import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";

export function WalletBalance() {
  const { address, isConnected } = useAccount();
  const { data } = useBalance({ address, query: { enabled: Boolean(address) } });

  if (!isConnected || !data) return null;
  return (
    <span className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
      {Number(formatUnits(data.value, data.decimals)).toFixed(4)} {data.symbol}
    </span>
  );
}
