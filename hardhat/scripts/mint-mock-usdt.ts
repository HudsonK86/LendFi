import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hre from "hardhat";
import { isAddress, parseUnits } from "viem";

type Args = {
  network?: string;
  usdt?: `0x${string}`;
  amount: bigint;
  accounts: number;
  deployerIndex: number;
  skipDeployerMint: boolean;
};

function printHelp() {
  console.log(`
Mint MockUSDT to the first N Hardhat accounts on the connected network.

Usage:
  node --import tsx/esm scripts/mint-mock-usdt.ts [--options]

  # (optional) Hardhat can still compile first:
  npx hardhat build
  node --import tsx/esm scripts/mint-mock-usdt.ts --network localhost

Options:
  --network <name>        Hardhat network name (default: $HARDHAT_NETWORK or localhost)
  --usdt <address>        MockUSDT contract address
                          (default: $MOCK_USDT_ADDRESS or $NEXT_PUBLIC_MOCK_USDT_ADDRESS,
                           else ignition/deployments/chain-31337/deployed_addresses.json)
  --amount <string>       Human amount in token units (default: 10000)
  --decimals <number>     MockUSDT decimals (default: 18)
  --accounts <number>     How many accounts to fund (default: 20, max: wallet count)
  --deployer-index <n>    Which wallet client is the MockUSDT owner (default: 0)
  --skip-deployer         Skip minting to the deployer address (default: false)

Notes:
  - MockUSDT.demoMint is onlyOwner, so the deployer account must match on-chain owner.
  - Hardhat exposes 20 well-known private keys by default — minting 20 is just convenience.
    You only need as many accounts as you want to test with.
`);
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i === -1) return undefined;
    return argv[i + 1];
  };

  const network = get("--network") ?? process.env.HARDHAT_NETWORK;

  const usdtRaw =
    get("--usdt") ??
    process.env.MOCK_USDT_ADDRESS ??
    process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS;

  const amountStr = get("--amount") ?? "10000";
  const decimalsStr = get("--decimals") ?? "18";
  const accountsStr = get("--accounts") ?? "20";
  const deployerIndexStr = get("--deployer-index") ?? "0";

  const skipDeployerMint = argv.includes("--skip-deployer");

  const decimals = Number(decimalsStr);
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`Invalid --decimals: ${decimalsStr}`);
  }

  const accounts = Number(accountsStr);
  if (!Number.isFinite(accounts) || accounts <= 0) {
    throw new Error(`Invalid --accounts: ${accountsStr}`);
  }

  const deployerIndex = Number(deployerIndexStr);
  if (!Number.isFinite(deployerIndex) || deployerIndex < 0) {
    throw new Error(`Invalid --deployer-index: ${deployerIndexStr}`);
  }

  let usdt: `0x${string}` | undefined;
  if (usdtRaw) {
    if (!isAddress(usdtRaw)) throw new Error(`Invalid --usdt address: ${usdtRaw}`);
    usdt = usdtRaw;
  }

  const amount = parseUnits(amountStr, decimals);

  return { network, usdt, amount, accounts, deployerIndex, skipDeployerMint };
}

async function defaultUsdtFromIgnition(): Promise<`0x${string}`> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const deployed = path.join(
    __dirname,
    "..",
    "ignition",
    "deployments",
    "chain-31337",
    "deployed_addresses.json",
  );
  const raw = JSON.parse(await fs.readFile(deployed, "utf8")) as Record<string, string>;
  const addr = raw["MockUSDTModule#MockUSDT"];
  if (!addr || !isAddress(addr)) {
    throw new Error(
      `Could not read MockUSDT address from ${deployed}. Deploy contracts or pass --usdt.`,
    );
  }
  return addr;
}

const args = parseArgs(process.argv.slice(2));

const networkName = args.network ?? hre.globalOptions.network ?? "localhost";

const connection = await hre.network.connect({ network: networkName });
try {
  const viem = connection.viem;
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();

  const usdtAddress = args.usdt ?? (await defaultUsdtFromIgnition());

  if (args.deployerIndex >= wallets.length) {
    throw new Error(
      `--deployer-index ${args.deployerIndex} is out of range (wallets=${wallets.length})`,
    );
  }

  const count = Math.min(args.accounts, wallets.length);
  const deployer = wallets[args.deployerIndex];

  const usdt = await viem.getContractAt("MockUSDT", usdtAddress, {
    client: { public: publicClient, wallet: deployer },
  });

  const onchainOwner = await usdt.read.owner();
  if (onchainOwner.toLowerCase() !== deployer.account.address.toLowerCase()) {
    throw new Error(
      `MockUSDT owner is ${onchainOwner}, but selected deployer is ${deployer.account.address}. ` +
        `Use the correct --deployer-index or deploy MockUSDT from this account.`,
    );
  }

  console.log(`Network: ${networkName}`);
  console.log(`MockUSDT: ${usdtAddress}`);
  console.log(`Minter (owner): ${deployer.account.address}`);
  console.log(`Amount per account: ${args.amount.toString()} (base units)`);
  console.log(`Recipients: first ${count} accounts${args.skipDeployerMint ? " (skipping deployer)" : ""}`);

  for (let i = 0; i < count; i++) {
    const to = wallets[i].account.address;
    if (args.skipDeployerMint && i === args.deployerIndex) {
      console.log(`- skip #${i} ${to} (deployer)`);
      continue;
    }
    const hash = await usdt.write.demoMint([to, args.amount]);
    console.log(`- mint #${i} ${to} tx=${hash}`);
  }

  console.log("Done.");
} finally {
  await connection.close();
}
