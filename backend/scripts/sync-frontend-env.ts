import fs from "node:fs/promises";
import path from "node:path";
import {
  LOCAL_CHAIN_ID,
  requireDeployedAddress,
  resolveRepoRootFromScript,
  readDeployedAddresses,
} from "./lib/deployments.js";

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
  const repoRoot = resolveRepoRootFromScript(import.meta.url);
  const frontendEnvPath = path.join(repoRoot, "frontend", ".env");

  const deployed = await readDeployedAddresses(repoRoot, LOCAL_CHAIN_ID);

  const frToken = requireDeployedAddress(deployed, "FRTokenModule#FRToken");
  const oracle = requireDeployedAddress(deployed, "MockPriceOracleModule#MockPriceOracle");
  const usdt = requireDeployedAddress(deployed, "MockUSDTModule#MockUSDT");
  const lendingPool = requireDeployedAddress(deployed, "LendingPoolModule#LendingPool");

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

