import { cookieToInitialState, type State } from "wagmi";

import { wagmiConfig } from "@/utils/web3config";

export function getInitialStateFromCookies(cookieHeader: string | null): State | undefined {
  if (!cookieHeader) return undefined;
  return cookieToInitialState(wagmiConfig, cookieHeader);
}
