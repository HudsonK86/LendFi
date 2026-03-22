import { QueryClient } from '@tanstack/react-query';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';
import { cookieStorage, createStorage } from 'wagmi';

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545';
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || '';

export const hardhatNetwork = defineChain({
  id: 31337,
  name: 'LendFi',
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:31337',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
});

if (!projectId) {
  console.warn(
    'NEXT_PUBLIC_PROJECT_ID is missing. AppKit may have limited wallet options.',
  );
}

export const wagmiAdapter = new WagmiAdapter({
  projectId: projectId || 'local-dev-project-id',
  networks: [hardhatNetwork],
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
export const queryClient = new QueryClient();
