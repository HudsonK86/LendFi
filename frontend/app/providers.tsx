"use client";

import { AppKitProvider } from "@reown/appkit/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import { WagmiProvider } from "wagmi";
import "react-toastify/dist/ReactToastify.css";

import { hardhatNetwork, projectId, queryClient, wagmiAdapter, wagmiConfig } from "@/lib/web3/config";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppKitProvider
      adapters={[wagmiAdapter]}
      projectId={projectId || "local-dev-project-id"}
      networks={[hardhatNetwork]}
      defaultNetwork={hardhatNetwork}
      metadata={{
        name: "LendFi",
        description: "LendFi shared-pool lending",
        url: "http://localhost:3000",
        icons: [],
      }}
      themeMode="dark"
      themeVariables={{
        "--w3m-accent": "#06b6d4",
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          {children}
          <ToastContainer position="bottom-right" theme="dark" autoClose={3500} />
        </QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  );
}
