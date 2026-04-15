export const CONTRACT_ADDRESSES = {
  lendingPool: process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}` | undefined,
  mockUsdt: process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS as `0x${string}` | undefined,
  frToken: process.env.NEXT_PUBLIC_FRTOKEN_ADDRESS as `0x${string}` | undefined,
  mockPriceOracle: process.env.NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS as `0x${string}` | undefined,
} as const;

export const DEMO_COMPAT_CONTRACT_ADDRESSES = {
  tokenContractAddress: process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ADDRESS as `0x${string}` | undefined,
  icoContractAddress: process.env.NEXT_PUBLIC_ICO_CONTRACT_ADDRESS as `0x${string}` | undefined,
} as const;
