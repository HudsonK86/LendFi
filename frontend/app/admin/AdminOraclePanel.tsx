"use client";

import { useMemo, useState } from "react";
import { isAddress } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { MockPriceOracle_ABI } from "@/lib/abi";

const oracleAddress = process.env.NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS as
  | `0x${string}`
  | undefined;
const configuredAdminWallet = process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS as
  | `0x${string}`
  | undefined;

function shortAddress(address?: string): string {
  if (!address) return "not set";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AdminOraclePanel() {
  const [nextPrice, setNextPrice] = useState("");
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: hash, writeContract, isPending: isWriting, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const ownerRead = useReadContract({
    abi: MockPriceOracle_ABI,
    address: oracleAddress,
    functionName: "owner",
    query: { enabled: Boolean(oracleAddress) },
  });
  const priceRead = useReadContract({
    abi: MockPriceOracle_ABI,
    address: oracleAddress,
    functionName: "getPrice",
    query: { enabled: Boolean(oracleAddress) },
  });

  const authorizedWallet = useMemo(
    () => configuredAdminWallet || (ownerRead.data as `0x${string}` | undefined),
    [ownerRead.data],
  );
  const walletMismatch =
    isConnected && Boolean(authorizedWallet) && address?.toLowerCase() !== authorizedWallet?.toLowerCase();
  const canWrite =
    Boolean(oracleAddress) && isConnected && !walletMismatch && isAddress(oracleAddress as string);

  function onSetPrice() {
    if (!canWrite || !oracleAddress) return;
    try {
      const newPrice = BigInt(nextPrice.trim());
      writeContract({
        abi: MockPriceOracle_ABI,
        address: oracleAddress,
        functionName: "setPrice",
        args: [newPrice],
      });
    } catch {
      // Invalid number is handled by disabling/inline message.
    }
  }

  const parsedPrice = useMemo(() => {
    try {
      return nextPrice.trim() ? BigInt(nextPrice.trim()) : null;
    } catch {
      return null;
    }
  }, [nextPrice]);

  return (
    <section className="mt-8 rounded-lg border border-neutral-200 p-5">
      <h2 className="text-lg font-semibold">Oracle admin controls</h2>
      <p className="mt-1 text-sm text-neutral-600">Set `MockPriceOracle.setPrice(uint256)` from MetaMask.</p>

      <div className="mt-4 grid gap-2 text-sm">
        <p>
          Oracle address:{" "}
          <code className="rounded bg-neutral-100 px-1">
            {oracleAddress || "Missing NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS"}
          </code>
        </p>
        <p>
          Authorized admin:{" "}
          <code className="rounded bg-neutral-100 px-1">{shortAddress(authorizedWallet)}</code>
          <span className="ml-2 text-neutral-500">(env override or on-chain owner)</span>
        </p>
        <p>
          Connected wallet: <code className="rounded bg-neutral-100 px-1">{shortAddress(address)}</code>
        </p>
        <p>
          Current price:{" "}
          <code className="rounded bg-neutral-100 px-1">
            {priceRead.data ? (priceRead.data as bigint).toString() : "loading..."}
          </code>
        </p>
      </div>

      {!isConnected ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              disabled={isConnecting}
              onClick={() => connect({ connector })}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Connect {connector.name}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => disconnect()}
          className="mt-4 rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          Disconnect wallet
        </button>
      )}

      {walletMismatch ? (
        <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">
          Connected wallet does not match authorized admin. Switch to the admin wallet to set oracle price.
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          New price (raw uint256)
          <input
            value={nextPrice}
            onChange={(e) => setNextPrice(e.target.value)}
            placeholder="e.g. 3500"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={!canWrite || !parsedPrice || isWriting || isConfirming}
          onClick={onSetPrice}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isWriting ? "Confirm in wallet..." : isConfirming ? "Waiting for tx..." : "Set price"}
        </button>
      </div>

      {!oracleAddress ? (
        <p className="mt-3 text-sm text-red-600">
          Set `NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS` in `frontend/.env`, then restart the frontend dev server.
        </p>
      ) : null}
      {!parsedPrice && nextPrice.trim() ? (
        <p className="mt-3 text-sm text-red-600">Price must be a valid integer.</p>
      ) : null}
      {writeError ? <p className="mt-3 text-sm text-red-600">{writeError.message}</p> : null}
      {hash ? (
        <p className="mt-3 text-sm text-neutral-600">
          Tx hash: <code className="rounded bg-neutral-100 px-1">{hash}</code>
        </p>
      ) : null}
      {isConfirmed ? <p className="mt-3 text-sm text-green-700">Transaction confirmed.</p> : null}
    </section>
  );
}
