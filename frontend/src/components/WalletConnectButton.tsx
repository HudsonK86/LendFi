"use client";

import { AppKitAccountButton, AppKitConnectButton } from "@reown/appkit/react";
import { useAccount } from "wagmi";

export function WalletConnectButton() {
  const { isConnected } = useAccount();
  if (isConnected) return <AppKitAccountButton />;
  return <AppKitConnectButton />;
}
