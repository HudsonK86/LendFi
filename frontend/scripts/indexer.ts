import { config } from "dotenv";

config();

import { createPublicClient, decodeEventLog, http, Log } from "viem";
import { hardhat } from "viem/chains";

import { FRToken_ABI } from "../src/lib/abi/FRToken";
import { LendingPool_ABI } from "../src/lib/abi/LendingPool";
import { MockPriceOracle_ABI } from "../src/lib/abi/MockPriceOracle";
import { getPool } from "../src/lib/db";

type PoolActivityArgs = {
  eventName: string;
  userAddress: string;
  counterpartyAddress: string | null;
  amountBaseUnits: bigint | null;
  raw: Record<string, unknown>;
};

const BATCH_SIZE = 2_000n;

function jsonStringifyBigInt(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVerbose(): boolean {
  return (process.env.INDEXER_VERBOSE ?? "false").toLowerCase() === "true";
}

async function getEnv(name: string): Promise<string> {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

async function getLastIndexedBlock(): Promise<bigint> {
  const pool = getPool();
  const res = await pool.query<{ value: string }>(
    "SELECT value FROM indexer_state WHERE key = 'last_indexed_block'",
  );
  if (res.rowCount === 0) return 0n;
  const raw = res.rows[0]?.value ?? "0";
  const n = BigInt(raw);
  return n < 0n ? 0n : n;
}

async function setLastIndexedBlock(block: bigint): Promise<void> {
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO indexer_state (key, value)
    VALUES ('last_indexed_block', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `,
    [block.toString()],
  );
}

function normalizeEvent(log: Log, decoded: ReturnType<typeof decodeEventLog>): PoolActivityArgs {
  const { eventName, args } = decoded as { eventName: string; args: any };
  const raw: Record<string, unknown> = { eventName, args };

  let userAddress: string;
  let counterpartyAddress: string | null = null;
  let amountBaseUnits: bigint | null = null;

  switch (eventName) {
    case "DepositLiquidity":
      userAddress = (args.user as string).toLowerCase();
      amountBaseUnits = args.amountUSDT as bigint;
      break;
    case "WithdrawLiquidity":
      userAddress = (args.user as string).toLowerCase();
      amountBaseUnits = args.amountUSDT as bigint;
      break;
    case "DepositCollateral":
      userAddress = (args.user as string).toLowerCase();
      amountBaseUnits = args.amountETH as bigint;
      break;
    case "WithdrawCollateral":
      userAddress = (args.user as string).toLowerCase();
      amountBaseUnits = args.amountETH as bigint;
      break;
    case "Borrow":
      userAddress = (args.borrower as string).toLowerCase();
      amountBaseUnits = args.amountUSDT as bigint;
      break;
    case "Repay":
      userAddress = (args.borrower as string).toLowerCase();
      amountBaseUnits = args.amountUSDT as bigint;
      break;
    case "Liquidate":
      userAddress = (args.borrower as string).toLowerCase();
      counterpartyAddress = (args.liquidator as string).toLowerCase();
      amountBaseUnits = args.repayUSDT as bigint;
      break;
    default:
      // Fallback: attribute to the first indexed address if present
      const addr =
        (args.user as string | undefined) ??
        (args.borrower as string | undefined) ??
        (args.liquidator as string | undefined) ??
        log.address;
      userAddress = addr.toLowerCase();
      amountBaseUnits = null;
      break;
  }

  return { eventName, userAddress, counterpartyAddress, amountBaseUnits, raw };
}

async function indexOnce(): Promise<boolean> {
  const rpcUrl = await getEnv("NEXT_PUBLIC_RPC_URL");
  const lendingPoolAddress = (await getEnv(
    "NEXT_PUBLIC_LENDING_POOL_ADDRESS",
  )) as `0x${string}`;
  const frTokenAddress = (await getEnv("NEXT_PUBLIC_FRTOKEN_ADDRESS")) as `0x${string}`;
  const oracleAddress = (await getEnv("NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS")) as `0x${string}`;

  const client = createPublicClient({
    chain: hardhat,
    transport: http(rpcUrl),
  });

  const chainId = await client.getChainId();
  const currentBlock = await client.getBlockNumber();
  let lastIndexed = await getLastIndexedBlock();

  // Local dev chains are often reset. If DB checkpoint is ahead of chain head,
  // auto-reset to allow reindexing without manual SQL cleanup.
  if (lastIndexed > currentBlock) {
    console.warn(
      `Indexer checkpoint (${lastIndexed.toString()}) is ahead of chain head (${currentBlock.toString()}); resetting checkpoint to 0.`,
    );
    lastIndexed = 0n;
    await setLastIndexedBlock(0n);
  }

  if (lastIndexed === 0n) {
    // start a little before current head to pick up recent events
    const backfill = 1_000n;
    lastIndexed = currentBlock > backfill ? currentBlock - backfill : 0n;
  }

  if (lastIndexed >= currentBlock) {
    if (isVerbose()) {
      console.log("No new blocks to index", {
        lastIndexed: lastIndexed.toString(),
        currentBlock: currentBlock.toString(),
      });
    }
    return false;
  }

  const fromBlock = lastIndexed + 1n;
  const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock ? currentBlock : fromBlock + BATCH_SIZE - 1n;

  if (isVerbose()) {
    console.log(
      `Indexing LendingPool events from blocks ${fromBlock.toString()} to ${toBlock.toString()}`,
    );
  }

  const logs = await client.getLogs({
    address: lendingPoolAddress,
    fromBlock,
    toBlock,
  });

  const pool = getPool();

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: LendingPool_ABI as any,
        data: log.data,
        topics: log.topics,
      });

      // Only handle known events from this contract
      if (!decoded.eventName) continue;

      const norm = normalizeEvent(log, decoded);
      const rawJson = jsonStringifyBigInt(norm.raw);

      await pool.query(
        `
        INSERT INTO pool_activity (
          chain_id,
          contract_address,
          block_number,
          tx_hash,
          log_index,
          event_name,
          user_address,
          counterparty_address,
          amount_base_units,
          raw
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (chain_id, contract_address, tx_hash, log_index) DO NOTHING
        `,
        [
          chainId,
          lendingPoolAddress.toLowerCase(),
          (log.blockNumber ?? 0n).toString(),
          log.transactionHash ?? "",
          log.logIndex ?? 0,
          norm.eventName,
          norm.userAddress,
          norm.counterpartyAddress,
          norm.amountBaseUnits != null ? norm.amountBaseUnits.toString() : null,
          rawJson,
        ],
      );
    } catch (e) {
      if (isVerbose()) {
        console.error("Failed to index log", { log }, e);
      } else {
        console.error("Failed to index one log entry", e);
      }
    }
  }

  // Snapshot market state for this indexed block range so analytics can chart prices over time.
  try {
    const [oraclePrice, poolValue, frTotalSupply, block] = await Promise.all([
      client.readContract({
        address: oracleAddress,
        abi: MockPriceOracle_ABI,
        functionName: "getPrice",
      }) as Promise<bigint>,
      client.readContract({
        address: lendingPoolAddress,
        abi: LendingPool_ABI,
        functionName: "getPoolValue",
      }) as Promise<bigint>,
      client.readContract({
        address: frTokenAddress,
        abi: FRToken_ABI,
        functionName: "totalSupply",
      }) as Promise<bigint>,
      client.getBlock({ blockNumber: toBlock }),
    ]);

    const oneFr = 10n ** 18n;
    const frNav = frTotalSupply > 0n ? (poolValue * oneFr) / frTotalSupply : 0n;
    const observedAt = new Date(Number(block.timestamp) * 1000).toISOString();

    await pool.query(
      `
      INSERT INTO pool_market_snapshots (
        chain_id,
        block_number,
        oracle_price_base_units,
        fr_nav_base_units,
        observed_at
      )
      VALUES ($1, $2, $3, $4, $5::timestamptz)
      ON CONFLICT (chain_id, block_number) DO NOTHING
      `,
      [chainId, toBlock.toString(), oraclePrice.toString(), frNav.toString(), observedAt],
    );
  } catch (e) {
    console.error("Failed to write pool_market_snapshots row", e);
  }

  await setLastIndexedBlock(toBlock);
  if (logs.length > 0 || isVerbose()) {
    console.log(
      `Indexed ${logs.length} logs; updated last_indexed_block to ${toBlock.toString()}`,
    );
  }
  return logs.length > 0;
}

async function main() {
  const pollMsRaw = process.env.INDEXER_POLL_MS ?? "10000";
  const pollMs = Number(pollMsRaw);
  if (!Number.isFinite(pollMs) || pollMs < 250) {
    throw new Error(`Invalid INDEXER_POLL_MS=${pollMsRaw}. Use a number >= 250.`);
  }

  console.log(`Indexer started (poll=${pollMs}ms, verbose=${isVerbose()}).`);

  // Continuous mode:
  // - catch up quickly when there is work
  // - when caught up, sleep and poll for new blocks
  for (;;) {
    const didWork = await indexOnce();
    if (!didWork) {
      await sleep(pollMs);
    }
  }
}

main().catch((err) => {
  console.error("Indexer error", err);
  process.exit(1);
});

