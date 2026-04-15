"use client";

import { createAppKit, AppKitProvider } from "@reown/appkit/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";

import { appkitNetworks, hardhatNetwork, projectId, queryClient, wagmiAdapter, wagmiConfig } from "@/utils/web3config";

createAppKit({
  adapters: [wagmiAdapter],
  projectId: projectId || "local-dev-project-id",
  networks: appkitNetworks,
  defaultNetwork: hardhatNetwork,
  metadata: {
    name: "LendFi",
    description: "LendFi shared-pool lending",
    url: "http://localhost:3000",
    icons: [],
  },
});

export function Web3ContextProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: State;
}) {
  return (
    <AppKitProvider
      adapters={[wagmiAdapter]}
      projectId={projectId || "local-dev-project-id"}
      networks={appkitNetworks}
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
      <WagmiProvider config={wagmiConfig} initialState={initialState}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  );
}
