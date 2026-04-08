import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type DeployedMap = Record<string, string>;

const CHAIN_ID = 31337;

function requireAddress(map: DeployedMap, key: string): string {
  const value = map[key];
  if (!value) throw new Error(`Missing deployed address for key: ${key}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid address for ${key}: ${value}`);
  }
  return value;
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  const suffix = content.endsWith("\n") ? "" : "\n";
  return `${content}${suffix}${line}\n`;
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.join(__dirname, "..", "..");
  const deployedPath = path.join(
    repoRoot,
    "hardhat",
    "ignition",
    "deployments",
    `chain-${CHAIN_ID}`,
    "deployed_addresses.json",
  );
  const frontendEnvPath = path.join(repoRoot, "frontend", ".env");

  const deployed = JSON.parse(await fs.readFile(deployedPath, "utf8")) as DeployedMap;

  const frToken = requireAddress(deployed, "FRTokenModule#FRToken");
  const oracle = requireAddress(deployed, "MockPriceOracleModule#MockPriceOracle");
  const usdt = requireAddress(deployed, "MockUSDTModule#MockUSDT");
  const lendingPool = requireAddress(deployed, "LendingPoolModule#LendingPool");

  let env = await fs.readFile(frontendEnvPath, "utf8");
  env = upsertEnvLine(env, "NEXT_PUBLIC_FRTOKEN_ADDRESS", frToken);
  env = upsertEnvLine(env, "NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS", oracle);
  env = upsertEnvLine(env, "NEXT_PUBLIC_MOCK_USDT_ADDRESS", usdt);
  env = upsertEnvLine(env, "NEXT_PUBLIC_LENDING_POOL_ADDRESS", lendingPool);

  await fs.writeFile(frontendEnvPath, env, "utf8");

  console.log("Updated frontend/.env with deployed addresses:");
  console.log(`- NEXT_PUBLIC_FRTOKEN_ADDRESS=${frToken}`);
  console.log(`- NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS=${oracle}`);
  console.log(`- NEXT_PUBLIC_MOCK_USDT_ADDRESS=${usdt}`);
  console.log(`- NEXT_PUBLIC_LENDING_POOL_ADDRESS=${lendingPool}`);
}

main().catch((err) => {
  console.error("Failed to sync frontend/.env:", err);
  process.exit(1);
});

