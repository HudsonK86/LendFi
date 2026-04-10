"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { formatUnits, isAddress, parseUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { MockPriceOracle_ABI } from "@/lib/abi";
import { btnPrimary, code, input, label } from "@/lib/ui";

const PRICE_DECIMALS = 18;

const oracleAddress = process.env.NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS as `0x${string}` | undefined;
const configuredAdminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS as `0x${string}` | undefined;

function shortAddress(address?: string): string {
  if (!address) return "not set";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

type OracleLogSnapshot = {
  previousPriceHuman: string;
  newPriceHuman: string;
  oracleAddress: `0x${string}`;
};

export function AdminOraclePanel() {
  const [nextPrice, setNextPrice] = useState("");
  const { address, isConnected } = useAccount();
  const { data: hash, writeContract, isPending: isWriting, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });
  const pendingLogRef = useRef<OracleLogSnapshot | null>(null);
  const loggedTxHashes = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isConfirmed) toast.success("Oracle price update confirmed");
  }, [isConfirmed]);
  useEffect(() => {
    if (writeError) toast.error(writeError.message);
  }, [writeError]);

  useEffect(() => {
    if (!isConfirmed || !hash) return;
    if (loggedTxHashes.current.has(hash)) return;
    loggedTxHashes.current.add(hash);
    const snap = pendingLogRef.current;
    pendingLogRef.current = null;
    void (async () => {
      try {
        const res = await fetch("/api/admin/log", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_oracle_price",
            details: {
              txHash: hash,
              oracleAddress: snap?.oracleAddress ?? oracleAddress,
              previousPriceUsdtPerEth: snap?.previousPriceHuman ?? null,
              newPriceUsdtPerEth: snap?.newPriceHuman ?? null,
            },
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          toast.warn(err.error ?? "Could not save admin audit log (on-chain update still succeeded).");
        }
      } catch {
        toast.warn("Could not save admin audit log (on-chain update still succeeded).");
      }
    })();
  }, [isConfirmed, hash]);

  const ownerRead = useReadContract({
    abi: MockPriceOracle_ABI,
    address: oracleAddress,
    functionName: "owner",
    query: { enabled: Boolean(oracleAddress) },
  });
  const {
    data: priceData,
    refetch: refetchPrice,
  } = useReadContract({
    abi: MockPriceOracle_ABI,
    address: oracleAddress,
    functionName: "getPrice",
    query: { enabled: Boolean(oracleAddress) },
  });

  useEffect(() => {
    if (!isConfirmed || !hash) return;
    void refetchPrice();
  }, [isConfirmed, hash, refetchPrice]);

  const authorizedWallet = useMemo(
    () => configuredAdminWallet || (ownerRead.data as `0x${string}` | undefined),
    [ownerRead.data],
  );
  const walletMismatch =
    isConnected && Boolean(authorizedWallet) && address?.toLowerCase() !== authorizedWallet?.toLowerCase();
  const canWrite =
    Boolean(oracleAddress) && isConnected && !walletMismatch && isAddress(oracleAddress as string);

  const currentRaw = priceData as bigint | undefined;
  const currentHuman = currentRaw != null ? formatUnits(currentRaw, PRICE_DECIMALS) : null;

  const priceWei = useMemo(() => {
    const t = nextPrice.trim();
    if (!t) return null;
    try {
      return parseUnits(t, PRICE_DECIMALS);
    } catch {
      return null;
    }
  }, [nextPrice]);

  function onSetPrice() {
    if (!canWrite || !oracleAddress) return;
    if (!priceWei) {
      if (nextPrice.trim()) {
        toast.error("Enter a valid price (USDT per 1 ETH), e.g. 2000 or 1999.5");
      }
      return;
    }
    pendingLogRef.current = {
      previousPriceHuman: currentHuman ?? "",
      newPriceHuman: nextPrice.trim(),
      oracleAddress,
    };
    writeContract({
      abi: MockPriceOracle_ABI,
      address: oracleAddress,
      functionName: "setPrice",
      args: [priceWei],
    });
    setNextPrice("");
  }

  return (
    <section className="mt-8 rounded-xl border border-amber-500/25 bg-amber-950/20 p-6 shadow-lg shadow-amber-950/20 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-amber-100">Oracle</h2>

      <div className="mt-5 grid gap-3 text-sm text-slate-300">
        <p>
          Contract{" "}
          <code className={code}>{oracleAddress || "Missing NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS"}</code>
        </p>
        <p>
          Authorized wallet{" "}
          <code className={code}>{shortAddress(authorizedWallet)}</code>
          <span className="ml-2 text-xs text-slate-500">(env or on-chain owner)</span>
        </p>
        <div className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current price</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
            {currentHuman != null ? `${Number(currentHuman).toLocaleString()} USDT / ETH` : "loading…"}
          </p>
        </div>
      </div>

      {walletMismatch ? (
        <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Connected wallet does not match the authorized admin. Switch to the deployer / admin account in MetaMask.
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm text-slate-300">
          <span className={label}>New price</span>
          <input
            value={nextPrice}
            onChange={(e) => setNextPrice(e.target.value)}
            placeholder="e.g. 2000"
            className={input}
          />
        </label>
        <button
          type="button"
          disabled={!canWrite || isWriting || isConfirming}
          onClick={onSetPrice}
          className={btnPrimary}
        >
          {isWriting ? "Confirm in wallet…" : isConfirming ? "Waiting for tx…" : "Set price"}
        </button>
      </div>

      {!oracleAddress ? (
        <p className="mt-4 text-sm text-red-400">
          Set <code className={code}>NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS</code> in <code className={code}>frontend/.env</code> and
          restart the dev server.
        </p>
      ) : null}
      {hash ? (
        <p className="mt-3 text-sm text-slate-400">
          Tx <code className={code}>{hash}</code>
        </p>
      ) : null}
      {isConfirmed ? <p className="mt-2 text-sm text-emerald-400/90">Transaction confirmed.</p> : null}
    </section>
  );
}
