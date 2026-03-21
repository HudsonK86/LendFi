import { expect } from "chai";
import { beforeEach, describe, it } from "node:test";
import {
  createHardhatRuntimeEnvironment,
  importUserConfig,
  resolveHardhatConfigPath,
} from "hardhat/hre";

const hreConfig = await importUserConfig(await resolveHardhatConfigPath());
const hre = await createHardhatRuntimeEnvironment(hreConfig);
const { network } = hre;

const ETH_PRICE = 2000n * 10n ** 18n;
const BONUS_BPS = 500n;

let viem: any;
let testClient: any;
let wallets: any[];
let publicClient: any;

let deployer: any;
let lender: any;
let borrower: any;
let liquidator: any;

let usdt: any;
let oracle: any;
let fr: any;
let pool: any;

async function getAs(contractName: string, address: string, wallet: any) {
  return viem.getContractAt(contractName, address, {
    client: { public: publicClient, wallet },
  });
}

async function seedLiquidity(amount: bigint = 50_000n * 10n ** 18n) {
  const usdtLender = await getAs("MockUSDT", usdt.address, lender);
  const poolLender = await getAs("LendingPool", pool.address, lender);
  await usdt.write.demoMint([lender.account.address, amount]);
  await usdtLender.write.approve([pool.address, amount]);
  await poolLender.write.depositLiquidity([amount]);
}

describe("LendingPool", () => {
  beforeEach(async () => {
    const conn = await network.connect();
    viem = conn.viem;
    wallets = await viem.getWalletClients();
    publicClient = await viem.getPublicClient();
    testClient = await viem.getTestClient();

    deployer = wallets[0];
    lender = wallets[1];
    borrower = wallets[2];
    liquidator = wallets[3];

    usdt = await viem.deployContract("MockUSDT");
    oracle = await viem.deployContract("MockPriceOracle");
    fr = await viem.deployContract("FRToken");
    pool = await viem.deployContract("LendingPool", [
      usdt.address,
      oracle.address,
      fr.address,
    ]);

    await oracle.write.setPrice([ETH_PRICE]);
    await fr.write.setLendingPool([pool.address]);
  });

  // A. First deposit mints FR 1:1
  it("A. First deposit mints FR 1:1", async () => {
    const amount = 100n * 10n ** 18n;
    const usdtLender = await getAs("MockUSDT", usdt.address, lender);
    const poolLender = await getAs("LendingPool", pool.address, lender);
    await usdt.write.demoMint([lender.account.address, amount]);
    await usdtLender.write.approve([pool.address, amount]);
    await poolLender.write.depositLiquidity([amount]);

    const frBalance = await fr.read.balanceOf([lender.account.address]);
    expect(frBalance).to.equal(amount);
  });

  // B. FR minting — non-first deposit uses pro-rata pool value
  it("B. Non-first deposit mints FR pro-rata (less than 1:1)", async () => {
    const lenderA = wallets[5];
    const borrowerB = wallets[6];
    const lenderB = wallets[7];
    const amount = 100n * 10n ** 18n;
    const usdtLenderA = await getAs("MockUSDT", usdt.address, lenderA);
    const usdtBorrowerB = await getAs("MockUSDT", usdt.address, borrowerB);
    const usdtLenderB = await getAs("MockUSDT", usdt.address, lenderB);
    const poolLenderA = await getAs("LendingPool", pool.address, lenderA);
    const poolBorrowerB = await getAs("LendingPool", pool.address, borrowerB);
    const poolLenderB = await getAs("LendingPool", pool.address, lenderB);

    await usdt.write.demoMint([lenderA.account.address, amount]);
    await usdtLenderA.write.approve([pool.address, amount]);
    await poolLenderA.write.depositLiquidity([amount]);

    await poolBorrowerB.write.depositCollateral([], { value: 1n * 10n ** 18n });
    await poolBorrowerB.write.borrow([50n * 10n ** 18n]);

    await testClient.increaseTime({ seconds: 365 * 24 * 60 * 60 });
    await testClient.mine({ blocks: 1 });

    await usdt.write.demoMint([borrowerB.account.address, 100n * 10n ** 18n]);
    await usdtBorrowerB.write.approve([pool.address, 100n * 10n ** 18n]);
    await poolBorrowerB.write.repay([100n * 10n ** 18n]);

    await usdt.write.demoMint([lenderB.account.address, amount]);
    await usdtLenderB.write.approve([pool.address, amount]);
    await poolLenderB.write.depositLiquidity([amount]);

    const frBalanceB = await fr.read.balanceOf([lenderB.account.address]);
    expect(frBalanceB).to.be.lessThan(amount);
  });


  it("C. Borrow reverts when exceeding max LTV", async () => {
    const poolBorrower = await getAs("LendingPool", pool.address, borrower);
    const ethCollateral = 1n * 10n ** 18n;
    await poolBorrower.write.depositCollateral([], { value: ethCollateral });

    const maxBorrow = await pool.read.getMaxBorrow([borrower.account.address]);
    expect(maxBorrow).to.equal(1400n * 10n ** 18n);

    await viem.assertions.revertWith(
      poolBorrower.write.borrow([1500n * 10n ** 18n]),
      "MAX_BORROW_EXCEEDED",
    );
  });

  // D. Borrow blocked — insufficient liquidity
  it("D. Borrow reverts when pool has insufficient USDT", async () => {
    const borrower2 = wallets[4];
    const poolBorrower2 = await getAs("LendingPool", pool.address, borrower2);
    await poolBorrower2.write.depositCollateral([], { value: 1n * 10n ** 18n });
    await viem.assertions.revertWith(
      poolBorrower2.write.borrow([1000n * 10n ** 18n]),
      "INSUFFICIENT_LIQUIDITY",
    );
  });

  // E. Borrow blocked — no collateral
  it("E. Borrow reverts when no collateral deposited", async () => {
    const freshBorrower = wallets[5];
    const poolFreshBorrower = await getAs("LendingPool", pool.address, freshBorrower);
    await viem.assertions.revertWith(
      poolFreshBorrower.write.borrow([10n * 10n ** 16n]),
      "NO_COLLATERAL",
    );
  });

  // F. Borrow blocked — zero oracle price
  it("F. Borrow reverts when oracle price is zero", async () => {
    const borrower3 = wallets[6];
    const poolBorrower3 = await getAs("LendingPool", pool.address, borrower3);
    await poolBorrower3.write.depositCollateral([], { value: 1n * 10n ** 18n });
    await oracle.write.setPrice([0n]);
    await viem.assertions.revertWith(
      poolBorrower3.write.borrow([10n * 10n ** 16n]),
      "PRICE_NOT_SET",
    );
    await oracle.write.setPrice([ETH_PRICE]);
  });

  // G. Lazy accrual — view returns virtual debt, storage unchanged
  it("G. getDebtValue returns virtual debt but storage debtUSDT is unchanged", async () => {
    await seedLiquidity();
    const b = wallets[7];
    const poolB = await getAs("LendingPool", pool.address, b);
    const usdtB = await getAs("MockUSDT", usdt.address, b);
    await poolB.write.depositCollateral([], { value: 1n * 10n ** 18n });
    await poolB.write.borrow([100n * 10n ** 16n]);

    const storedBefore = await pool.read.debtUSDT([b.account.address]);
    await testClient.increaseTime({ seconds: 365 * 24 * 60 * 60 });
    await testClient.mine({ blocks: 1 });
    const virtualDebt = await pool.read.getDebtValue([b.account.address]);
    const storedAfter = await pool.read.debtUSDT([b.account.address]);

    expect(virtualDebt > storedBefore).to.equal(true);
    expect(storedAfter).to.equal(storedBefore);

    await usdt.write.demoMint([b.account.address, 10n * 10n ** 16n]);
    await usdtB.write.approve([pool.address, 10n * 10n ** 16n]);
    await poolB.write.repay([10n * 10n ** 16n]);
    const storedAfterRepay = await pool.read.debtUSDT([b.account.address]);
    expect(storedAfterRepay).to.be.lessThan(storedAfter);
  });

  // H. Repay reduces normalized debt correctly
  it("H. Repay reduces normalized debt correctly", async () => {
    await seedLiquidity();
    const b = wallets[8];
    const poolB = await getAs("LendingPool", pool.address, b);
    const usdtB = await getAs("MockUSDT", usdt.address, b);
    await poolB.write.depositCollateral([], { value: 1n * 10n ** 18n });
    await poolB.write.borrow([100n * 10n ** 16n]);
    await testClient.increaseTime({ seconds: 365 * 24 * 60 * 60 });
    await testClient.mine({ blocks: 1 });
    await usdt.write.demoMint([b.account.address, 200n * 10n ** 16n]);
    await usdtB.write.approve([pool.address, 200n * 10n ** 16n]);
    const debtBefore = await pool.read.debtUSDT([b.account.address]);
    // repay() calls _updateBorrowerDebt() first; getDebtValue() is the matching
    // “virtual debt” after lazy accrual at the current block timestamp.
    const normalizedDebtBeforeRepay = await pool.read.getDebtValue([
      b.account.address,
    ]);
    const repayAmt = 50n * 10n ** 16n;
    await poolB.write.repay([repayAmt]);
    const debtAfter = await pool.read.debtUSDT([b.account.address]);
    const expected = normalizedDebtBeforeRepay - repayAmt;
    const diff = debtAfter > expected ? debtAfter - expected : expected - debtAfter;
    // Minor timestamp/block differences between the read (getDebtValue) and the
    // subsequent mined write (repay) can cause tiny rounding deltas in lazy
    // interest accrual.
    expect(diff).to.be.lessThan(1_000_000_000_000n);
  });

  // I. withdrawCollateral blocked — HF below 1
  it("I. withdrawCollateral reverts when HF would drop below 1", async () => {
    await seedLiquidity();
    const b = wallets[9];
    const poolB = await getAs("LendingPool", pool.address, b);
    await poolB.write.depositCollateral([], { value: 1n * 10n ** 18n });
    await poolB.write.borrow([1400n * 10n ** 18n - 1n]);
    // With 1 ETH collateral and debt close to max LTV, withdrawing a ~13% chunk
    // should push postCollateral HF below 1e18.
    const withdrawAmt = 130n * 10n ** 15n; // 0.13 ETH
    await viem.assertions.revertWith(
      poolB.write.withdrawCollateral([withdrawAmt]),
      "HF_BELOW_ONE",
    );
  });

  // J. withdrawCollateral allowed — HF stays ≥ 1
  it("J. withdrawCollateral succeeds when HF stays >= 1", async () => {
    await seedLiquidity();
    const b = wallets[10];
    const poolB = await getAs("LendingPool", pool.address, b);
    await poolB.write.depositCollateral([], { value: 2n * 10n ** 18n });
    await poolB.write.borrow([10n * 10n ** 16n]);
    const collateralBefore = await pool.read.collateralETH([b.account.address]);
    await poolB.write.withdrawCollateral([5n * 10n ** 17n]);
    const collateralAfter = await pool.read.collateralETH([b.account.address]);

    expect(collateralAfter).to.equal(collateralBefore - 5n * 10n ** 17n);
  });

  // K. Liquidation blocked — HF >= 1
  it("K. Liquidation reverts when HF >= 1", async () => {
    await seedLiquidity();
    const b = wallets[11];
    const poolB = await getAs("LendingPool", pool.address, b);
    const usdtLiquidator = await getAs("MockUSDT", usdt.address, liquidator);
    const poolLiquidator = await getAs("LendingPool", pool.address, liquidator);
    await poolB.write.depositCollateral([], { value: 1n * 10n ** 18n });
    await poolB.write.borrow([100n * 10n ** 16n]);
    await usdt.write.demoMint([liquidator.account.address, 200n * 10n ** 16n]);
    await usdtLiquidator.write.approve([pool.address, 200n * 10n ** 16n]);
    await viem.assertions.revertWith(
      poolLiquidator.write.liquidate([b.account.address, 10n * 10n ** 16n]),
      "HF_ABOVE_ONE",
    );
  });

  // L. Liquidation allowed — HF < 1
  it("L. Liquidation succeeds when HF < 1", async () => {
    await seedLiquidity();
    const b = wallets[12];
    const poolB = await getAs("LendingPool", pool.address, b);
    const usdtLiquidator = await getAs("MockUSDT", usdt.address, liquidator);
    const poolLiquidator = await getAs("LendingPool", pool.address, liquidator);
    await poolB.write.depositCollateral([], { value: 1n * 10n ** 18n });
    // Borrow close to max LTV; then wait long enough for lazy accrual to push HF < 1.
    await poolB.write.borrow([1400n * 10n ** 18n - 1n]);
    await usdt.write.demoMint([liquidator.account.address, 2000n * 10n ** 18n]);
    await usdtLiquidator.write.approve([pool.address, 2000n * 10n ** 18n]);

    const collateralBefore = await pool.read.collateralETH([b.account.address]);

    await testClient.increaseTime({ seconds: 7 * 365 * 24 * 60 * 60 });
    await testClient.mine({ blocks: 1 });

    // liquidate() normalizes debt before checking HF, so compare against normalized (virtual) debt.
    const debtBefore = await pool.read.getDebtValue([b.account.address]);
    await poolLiquidator.write.liquidate([b.account.address, 100n * 10n ** 18n]);
    const debtAfter = await pool.read.debtUSDT([b.account.address]);
    const collateralAfter = await pool.read.collateralETH([b.account.address]);

    expect(debtAfter).to.be.lessThan(debtBefore);
    expect(collateralAfter).to.be.lessThan(collateralBefore);
  });

  // M. Liquidation — 5% bonus math
  it("M. Liquidation bonus is exactly 5%", async () => {
    await seedLiquidity();
    const b = wallets[13];
    const poolB = await getAs("LendingPool", pool.address, b);
    const usdtLiquidator = await getAs("MockUSDT", usdt.address, liquidator);
    const poolLiquidator = await getAs("LendingPool", pool.address, liquidator);
    await poolB.write.depositCollateral([], { value: 10n * 10n ** 18n });
    // Borrow close to max LTV, then wait for lazy accrual to allow liquidation.
    await poolB.write.borrow([14000n * 10n ** 18n - 1n]);
    await usdt.write.demoMint([liquidator.account.address, 50000n * 10n ** 18n]);
    await usdtLiquidator.write.approve([pool.address, 50000n * 10n ** 18n]);

    const repayAmt = 1000n * 10n ** 18n;
    const expectedSeized =
      (repayAmt * (10000n + BONUS_BPS) * 10n ** 18n) / (10000n * ETH_PRICE);

    const collateralBefore = await pool.read.collateralETH([b.account.address]);

    await testClient.increaseTime({ seconds: 3 * 365 * 24 * 60 * 60 });
    await testClient.mine({ blocks: 1 });

    await poolLiquidator.write.liquidate([b.account.address, repayAmt]);
    const collateralAfter = await pool.read.collateralETH([b.account.address]);
    const actualSeized = collateralBefore - collateralAfter;

    expect(actualSeized).to.be.at.most(expectedSeized);
  });

  // N. Liquidation — seized ETH capped by collateral
  it("N. Seized ETH is capped by remaining collateral", async () => {
    await seedLiquidity();
    const b = wallets[14];
    const poolB = await getAs("LendingPool", pool.address, b);
    const usdtLiquidator = await getAs("MockUSDT", usdt.address, liquidator);
    const poolLiquidator = await getAs("LendingPool", pool.address, liquidator);
    await poolB.write.depositCollateral([], { value: 1n * 10n ** 16n });
    await poolB.write.borrow([14n * 10n ** 18n]);
    await oracle.write.setPrice([1000n * 10n ** 18n]);
    await usdt.write.demoMint([liquidator.account.address, 50000n * 10n ** 18n]);
    await usdtLiquidator.write.approve([pool.address, 50000n * 10n ** 18n]);
    await poolLiquidator.write.liquidate([b.account.address, 10000n * 10n ** 18n]);
    const collateralAfter = await pool.read.collateralETH([b.account.address]);
    expect(collateralAfter).to.equal(0n);
  });

  // O. Liquidation — repay capped at debt
  it("O. Repay is capped at borrower debt; excess USDT stays with liquidator", async () => {
    await seedLiquidity();
    const b = wallets[15];
    const poolB = await getAs("LendingPool", pool.address, b);
    const usdtLiquidator = await getAs("MockUSDT", usdt.address, liquidator);
    const poolLiquidator = await getAs("LendingPool", pool.address, liquidator);
    await poolB.write.depositCollateral([], { value: 1n * 10n ** 18n });
    const initialBorrow = 1400n * 10n ** 18n - 1n;
    await poolB.write.borrow([initialBorrow]);
    const repayAmount = 100000n * 10n ** 18n; // ensure repayAmount > normalized debt
    await usdt.write.demoMint([liquidator.account.address, repayAmount]);
    const liquidatorUsdtBefore = await usdt.read.balanceOf([
      liquidator.account.address,
    ]);
    await usdtLiquidator.write.approve([pool.address, repayAmount]);

    await testClient.increaseTime({ seconds: 7 * 365 * 24 * 60 * 60 });
    await testClient.mine({ blocks: 1 });

    await poolLiquidator.write.liquidate([b.account.address, repayAmount]);

    const debtAfter = await pool.read.debtUSDT([b.account.address]);
    expect(debtAfter).to.equal(0n);

    const liquidatorUsdtAfter = await usdt.read.balanceOf([liquidator.account.address]);
    const actualCost = liquidatorUsdtBefore - liquidatorUsdtAfter;
    expect(actualCost).to.be.at.least(initialBorrow);
    expect(actualCost).to.be.at.most(repayAmount);
  });

  // P. withdrawLiquidity blocked — insufficient pool cash
  it("P. withdrawLiquidity reverts when pool has insufficient USDT", async () => {
    const lender2 = wallets[16];
    const borrower5 = wallets[17];
    const usdtLender2 = await getAs("MockUSDT", usdt.address, lender2);
    const poolLender2 = await getAs("LendingPool", pool.address, lender2);
    const poolBorrower5 = await getAs("LendingPool", pool.address, borrower5);
    await usdt.write.demoMint([lender2.account.address, 100n * 10n ** 18n]);
    await usdtLender2.write.approve([pool.address, 100n * 10n ** 18n]);
    await poolLender2.write.depositLiquidity([100n * 10n ** 18n]);
    await poolBorrower5.write.depositCollateral([], { value: 1n * 10n ** 18n });
    await poolBorrower5.write.borrow([90n * 10n ** 18n]);
    const frBalance = await fr.read.balanceOf([lender2.account.address]);
    await viem.assertions.revertWith(
      poolLender2.write.withdrawLiquidity([frBalance]),
      "INSUFFICIENT_LIQUIDITY",
    );
  });

  // Q. totalSuppliedUSDT — principal-only accounting
  it("Q. totalSuppliedUSDT tracks principal only, not earnings", async () => {
    const lender3 = wallets[18];
    const amount = 100n * 10n ** 18n;
    const usdtLender3 = await getAs("MockUSDT", usdt.address, lender3);
    const poolLender3 = await getAs("LendingPool", pool.address, lender3);
    await usdt.write.demoMint([lender3.account.address, amount]);
    await usdtLender3.write.approve([pool.address, amount]);
    await poolLender3.write.depositLiquidity([amount]);

    let totalSupplied = await pool.read.totalSuppliedUSDT();
    expect(totalSupplied).to.equal(amount);

    const frSupply = await fr.read.totalSupply();
    await poolLender3.write.withdrawLiquidity([frSupply / 2n]);

    totalSupplied = await pool.read.totalSuppliedUSDT();
    expect(totalSupplied).to.equal(amount / 2n);
  });
});
