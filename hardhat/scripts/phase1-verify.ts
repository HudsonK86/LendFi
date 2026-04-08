import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hre from "hardhat";
import { decodeEventLog, getEventSelector, parseAbiItem, parseEther } from "viem";

type DeployedAddresses = Record<string, string>;

const CHAIN_ID = 31337;
const SECONDS_PER_DAY = 86400;

async function defaultDeployedAddresses(): Promise<DeployedAddresses> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const deployed = path.join(
    __dirname,
    "..",
    "ignition",
    "deployments",
    `chain-${CHAIN_ID}`,
    "deployed_addresses.json",
  );
  const raw = JSON.parse(await fs.readFile(deployed, "utf8")) as DeployedAddresses;
  return raw;
}

function addrFromMap(raw: DeployedAddresses, key: string): `0x${string}` {
  const v = raw[key];
  if (!v) throw new Error(`Missing deployed address for ${key}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`Invalid address for ${key}: ${v}`);
  return v as `0x${string}`;
}

async function main() {
  const connection = await hre.network.connect({ network: "localhost" });
  try {
    const viem = connection.viem;
    const publicClient = await viem.getPublicClient();
    const wallets = await viem.getWalletClients();

    const deployed = await defaultDeployedAddresses();
    const usdtAddress = addrFromMap(deployed, "MockUSDTModule#MockUSDT");
    const lendingPoolAddress = addrFromMap(deployed, "LendingPoolModule#LendingPool");
    const oracleAddress = addrFromMap(deployed, "MockPriceOracleModule#MockPriceOracle");

    const lender = wallets[0]; // deposits liquidity
    const borrower = wallets[1]; // deposits collateral, borrows, repays
    const liquidator = wallets[2]; // liquidates

    const borrowerAddr = borrower.account.address;
    const lenderAddr = lender.account.address;
    const liquidatorAddr = liquidator.account.address;

    const usdtLender = await viem.getContractAt("MockUSDT", usdtAddress, {
      client: { public: publicClient, wallet: lender },
    });
    const lendingPoolLender = await viem.getContractAt("LendingPool", lendingPoolAddress, {
      client: { public: publicClient, wallet: lender },
    });
    const oracle = await viem.getContractAt("MockPriceOracle", oracleAddress, {
      client: { public: publicClient, wallet: lender },
    });

    const usdtBorrower = await viem.getContractAt("MockUSDT", usdtAddress, {
      client: { public: publicClient, wallet: borrower },
    });
    const lendingPoolBorrower = await viem.getContractAt("LendingPool", lendingPoolAddress, {
      client: { public: publicClient, wallet: borrower },
    });

    const usdtLiquidator = await viem.getContractAt("MockUSDT", usdtAddress, {
      client: { public: publicClient, wallet: liquidator },
    });
    const lendingPoolLiquidator = await viem.getContractAt("LendingPool", lendingPoolAddress, {
      client: { public: publicClient, wallet: liquidator },
    });

    const frDecimals = 18n;
    const USDT_DECIMALS = 18n;
    // Ensure oracle has a non-zero price so borrow/max-borrow works.
    const currentOracleOwner = await oracle.read.owner();
    if (currentOracleOwner.toLowerCase() !== lenderAddr.toLowerCase()) {
      throw new Error(
        `Unexpected oracle owner. oracleOwner=${currentOracleOwner} lender=${lenderAddr}.`,
      );
    }
    const priceWei = parseEther("2000");
    const priceHash = await oracle.write.setPrice([priceWei]);
    await publicClient.waitForTransactionReceipt({ hash: priceHash });

    // ─── Constants (school-demo friendly) ────────────────────────────────
    const depositLiquidityAmt = 5000n * 10n ** USDT_DECIMALS; // 5k USDT
    const withdrawLiquidityFr = 1000n * 10n ** frDecimals; // redeem ~1k USDT

    const depositEth = parseEther("2"); // borrower deposits 2 ETH
    const withdrawEth = parseEther("0.5"); // borrower withdraws 0.5 ETH (HF passes because no debt)

    // ─── 1) Deposit / Withdraw liquidity ────────────────────────────────
    // Approve USDT -> pool
    await usdtLender.write.approve([lendingPoolAddress, depositLiquidityAmt]);
    const depHash = await lendingPoolLender.write.depositLiquidity([depositLiquidityAmt]);
    const depReceipt = await publicClient.waitForTransactionReceipt({ hash: depHash });

    // Withdraw liquidity (small amount)
    await lendingPoolLender.write.withdrawLiquidity([withdrawLiquidityFr]);
    // (No need to parse event args for this phase; we validate totals via collateral below.)

    // ─── 2) Deposit / Withdraw collateral ───────────────────────────────
    const totalBeforeDeposit = await lendingPoolBorrower.read.totalCollateralETH();
    const depositReceiptHash = await lendingPoolBorrower.write.depositCollateral([], { value: depositEth });
    const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositReceiptHash });

    const totalAfterDeposit = await lendingPoolBorrower.read.totalCollateralETH();
    if (totalAfterDeposit !== totalBeforeDeposit + depositEth) {
      throw new Error(`totalCollateralETH mismatch after deposit. before=${totalBeforeDeposit} after=${totalAfterDeposit}`);
    }

    // Withdraw collateral
    await lendingPoolBorrower.write.withdrawCollateral([withdrawEth]);
    const totalAfterWithdraw = await lendingPoolBorrower.read.totalCollateralETH();
    if (totalAfterWithdraw !== totalAfterDeposit - withdrawEth) {
      throw new Error(`totalCollateralETH mismatch after withdraw. afterDeposit=${totalAfterDeposit} afterWithdraw=${totalAfterWithdraw}`);
    }

    // ─── 3) Borrow / Repay ─────────────────────────────────────────────
    const maxBorrow = await lendingPoolBorrower.read.getMaxBorrow([borrowerAddr]);
    const poolLiquidity = await usdtLender.read.balanceOf([lendingPoolAddress]);

    if (maxBorrow === 0n) throw new Error("maxBorrow is 0; deposit collateral may be insufficient");

    // Borrow slightly under the computed maximum to avoid edge-case rounding
    // between `getMaxBorrow()` (uses virtual debt) and `borrow()` (uses storage debt).
    const safeMaxBorrow = (maxBorrow * 99n) / 100n;
    const borrowAmt = safeMaxBorrow > poolLiquidity ? poolLiquidity : safeMaxBorrow;
    if (borrowAmt === 0n) throw new Error("Borrow amount ended up 0 after liquidity check");

    const borrowHash = await lendingPoolBorrower.write.borrow([borrowAmt]);
    await publicClient.waitForTransactionReceipt({ hash: borrowHash });

    // Repay only a small fraction so the position stays close enough to liquidation
    // for the time-jump below to make `getHealthFactor()` drop below 1.
    const repayAmt = borrowAmt / 10n;
    if (repayAmt <= 0n) throw new Error("repayAmt ended up 0; borrow amount too small");

    await usdtBorrower.write.approve([lendingPoolAddress, repayAmt]);
    const repayHash = await lendingPoolBorrower.write.repay([repayAmt]);
    const repayReceipt = await publicClient.waitForTransactionReceipt({ hash: repayHash });

    // ─── 4) Increase time until liquidation becomes possible ──────────
    const liquidatableBelow = 1_000_000_000_000_000_000n; // 1e18
    let hf = await lendingPoolBorrower.read.getHealthFactor([borrowerAddr]);

    let i = 0;
    while (hf >= liquidatableBelow && i < 12) {
      // Increase by ~1 year each iteration
      const seconds = (365 * SECONDS_PER_DAY) as number;
      const provider = (connection as any).provider ?? hre.network.provider;
      await provider.send("evm_increaseTime", [seconds]);
      await provider.send("evm_mine", []);
      hf = await lendingPoolBorrower.read.getHealthFactor([borrowerAddr]);
      i++;
    }

    if (hf >= liquidatableBelow) {
      throw new Error(`Still not liquidatable. healthFactor=${hf.toString()}`);
    }

    // ─── 5) Liquidate ───────────────────────────────────────────────────
    const totalBeforeLiquidate = await lendingPoolBorrower.read.totalCollateralETH();
    const collBefore = await lendingPoolBorrower.read.collateralETH([borrowerAddr]);

    const repayForLiquidate = borrowAmt; // repayActual will be min(repayForLiquidate, debt)
    await usdtLiquidator.write.approve([lendingPoolAddress, repayForLiquidate]);

    const liqHash = await lendingPoolLiquidator.write.liquidate([borrowerAddr, repayForLiquidate]);
    const liqReceipt = await publicClient.waitForTransactionReceipt({ hash: liqHash });

    const totalAfterLiquidate = await lendingPoolBorrower.read.totalCollateralETH();
    const collAfter = await lendingPoolBorrower.read.collateralETH([borrowerAddr]);

    const collateralSeizedActual = collBefore - collAfter;
    if (totalAfterLiquidate !== totalBeforeLiquidate - collateralSeizedActual) {
      throw new Error(
        `totalCollateralETH mismatch after liquidate. before=${totalBeforeLiquidate} after=${totalAfterLiquidate} seized=${collateralSeizedActual}`,
      );
    }

    // ─── Event presence checks (decode at least deposit + liquidate) ───
    const depositCollateralEvent = parseAbiItem(
      "event DepositCollateral(address indexed user, uint256 amountETH)",
    );
    const depositCollateralSelector = getEventSelector(depositCollateralEvent);
    const depositCollateralLog = depositReceipt.logs.find((l) => l.topics[0] === depositCollateralSelector);
    if (!depositCollateralLog) throw new Error("DepositCollateral event not found in receipt logs");

    const depositDecoded = decodeEventLog({
      abi: [depositCollateralEvent],
      data: depositCollateralLog.data,
      topics: depositCollateralLog.topics,
    });
    if (depositDecoded.args.user.toLowerCase() !== borrowerAddr.toLowerCase()) {
      throw new Error(`DepositCollateral user mismatch; got=${depositDecoded.args.user}, expected=${borrowerAddr}`);
    }

    const liquidateEvent = parseAbiItem(
      "event Liquidate(address indexed borrower, address indexed liquidator, uint256 repayUSDT, uint256 collateralTakenETH)",
    );
    const liquidateSelector = getEventSelector(liquidateEvent);
    const liqLog = liqReceipt.logs.find((l) => l.topics[0] === liquidateSelector);
    if (!liqLog) throw new Error("Liquidate event not found in receipt logs");

    const liqDecoded = decodeEventLog({
      abi: [liquidateEvent],
      data: liqLog.data,
      topics: liqLog.topics,
    });
    if (liqDecoded.args.borrower.toLowerCase() !== borrowerAddr.toLowerCase()) {
      throw new Error(`Liquidate borrower mismatch; got=${liqDecoded.args.borrower}, expected=${borrowerAddr}`);
    }
    if (liqDecoded.args.liquidator.toLowerCase() !== liquidatorAddr.toLowerCase()) {
      throw new Error(`Liquidate liquidator mismatch; got=${liqDecoded.args.liquidator}, expected=${liquidatorAddr}`);
    }

    console.log("Phase 1 verification OK");
    console.log({
      lender: lenderAddr,
      borrower: borrowerAddr,
      liquidator: liquidatorAddr,
      healthFactorAfterTime: hf.toString(),
      collateralSeizedActual: collateralSeizedActual.toString(),
    });
    void depReceipt;
    void repayReceipt;
  } finally {
    await connection.close();
  }
}

main().catch((e) => {
  console.error("Phase1 verify failed:", e);
  process.exit(1);
});

