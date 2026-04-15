import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type DeployedAddressesMap = Record<string, string>;

export const LOCAL_CHAIN_ID = 31337;

export function resolveRepoRootFromScript(scriptUrl: string): string {
  const scriptDir = path.dirname(fileURLToPath(scriptUrl));
  return path.join(scriptDir, "..", "..");
}

export function resolveDeployedAddressesPath(repoRoot: string, chainId = LOCAL_CHAIN_ID): string {
  return path.join(
    repoRoot,
    "backend",
    "ignition",
    "deployments",
    `chain-${chainId}`,
    "deployed_addresses.json",
  );
}

export async function readDeployedAddresses(repoRoot: string, chainId = LOCAL_CHAIN_ID): Promise<DeployedAddressesMap> {
  const deployedPath = resolveDeployedAddressesPath(repoRoot, chainId);
  const raw = await fs.readFile(deployedPath, "utf8");
  return JSON.parse(raw) as DeployedAddressesMap;
}

export async function readDeployedAddressesFromScript(
  scriptUrl: string,
  chainId = LOCAL_CHAIN_ID,
): Promise<DeployedAddressesMap> {
  const repoRoot = resolveRepoRootFromScript(scriptUrl);
  return readDeployedAddresses(repoRoot, chainId);
}

export function requireDeployedAddress(map: DeployedAddressesMap, key: string): `0x${string}` {
  const value = map[key];
  if (!value) throw new Error(`Missing deployed address for key: ${key}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid address for ${key}: ${value}`);
  }
  return value as `0x${string}`;
}
