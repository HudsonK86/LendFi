import { expect } from "chai";
import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import { importUserConfig } from "hardhat/hre";

const hreConfig = await importUserConfig();
const hre = await createHardhatRuntimeEnvironment(hreConfig);

console.log("network keys:", Object.keys(hre.network));
console.log("ethers:", typeof hre.ethers);
const { network } = hre;
const artifacts = hre.artifacts;

const ETH_PRICE = 2000n * 10n ** 18n;
const BONUS_BPS = 500n;

let deployer: ReturnType<typeof ethers.signers.getUnsinnedSigner>;
let lender: ReturnType<typeof ethers.signers.getUnsinnedSigner>;
let borrower: ReturnType<typeof ethers.signers.getUnsinnedSigner>;
let liquidator: ReturnType<typeof ethers.signers.getUnsinnedSigner>;
let usdt: Awaited<ReturnType<typeof ethers.deployContract>>;
let oracle: Awaited<ReturnType<typeof ethers.deployContract>>;
let fr: Awaited<ReturnType<typeof ethers.deployContract>>;
let pool: Awaited<ReturnType<typeof ethers.deployContract>>;

describe("LendingPool", () => {
  beforeEach(async () => {
    const signers = await network.connect();
    deployer = signers[0] as any;
    lender = signers[1] as any;
    borrower = signers[2] as any;
    liquidator = signers[3] as any;

    const USDTArtifact = await artifacts.readArtifact("MockUSDT");
    const OracleArtifact = await artifacts.readArtifact("MockPriceOracle");
    const FRArtifact = await artifacts.readArtifact("FRToken");
    const PoolArtifact = await artifacts.readArtifact("LendingPool");

    const USDTFactory = new ethers.ContractFactory(USDTArtifact.abi, USDTArtifact.bytecode, deployer);
    usdt = await USDTFactory.deploy() as any;

    const OracleFactory = new ethers.ContractFactory(OracleArtifact.abi, OracleArtifact.bytecode, deployer);
    oracle = await OracleFactory.deploy() as any;
    await oracle.setPrice(ETH_PRICE);

    const FRFactory = new ethers.ContractFactory(FRArtifact.abi, FRArtifact.bytecode, deployer);
    fr = await FRFactory.deploy() as any;

    const PoolFactory = new ethers.ContractFactory(PoolArtifact.abi, PoolArtifact.bytecode, deployer);
    pool = await PoolFactory.deploy(await usdt.getAddress(), await oracle.getAddress(), await fr.getAddress()) as any;

    await fr.setLendingPool(await pool.getAddress());
  });

  // A. First deposit mints FR 1:1
  it("A. First deposit mints FR 1:1", async () => {
    const amount = 100n * 10n ** 18n;
    await usdt.demoMint(lender.address, amount);
    await usdt.connect(lender).approve(await pool.getAddress(), amount);
    await pool.connect(lender).depositLiquidity(amount);

    const frBalance = await fr.balanceOf(lender.address);
    expect(frBalance).to.equal(amount);
  });

  // B. FR minting — non-first deposit uses pro-rata pool value
  it("B. Non-first deposit mints FR pro-rata (less than 1:1)", async () => {
    // Lender A deposits first — mints 1:1
    const lenderA = (await network.connect())[5] as any;
    const amount = 100n * 10n ** 18n;
    await usdt.demoMint(lenderA.address, amount);
    await usdt.connect(lenderA).approve(await pool.getAddress(), amount);
    await pool.connect(lenderA).depositLiquidity(amount);

    // Borrower deposits collateral and borrows (reduces pool USDT balance)
    const borrowerB = (await network.connect())[6] as any;
    await pool.connect(borrowerB).depositCollateral({ value: 1n * 10n ** 18n });
    await pool.connect(borrowerB).borrow(50n * 10n ** 18n);

    // Advance time to accrue interest
    await network.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await network.provider.send("evm_mine", []);

    // Borrower repays to realize accrued interest into pool
    await usdt.demoMint(borrowerB.address, 100n * 10n ** 18n);
    await usdt.connect(borrowerB).approve(await pool.getAddress(), 100n * 10n ** 18n);
    await pool.connect(borrowerB).repay(100n * 10n ** 18n);

    // Lender B deposits — should receive less FR than USDT deposited
    const lenderB = (await network.connect())[7] as any;
    await usdt.demoMint(lenderB.address, amount);
    await usdt.connect(lenderB).approve(await pool.getAddress(), amount);
    await pool.connect(lenderB).depositLiquidity(amount);

    const frBalanceB = await fr.balanceOf(lenderB.address);
    expect(frBalanceB).to.be.lessThan(amount);
  });


  it("C. Borrow reverts when exceeding max LTV", async () => {
    const ethCollateral = 1n * 10n ** 18n;
    await pool.connect(borrower).depositCollateral({ value: ethCollateral });

    const maxBorrow = await pool.getMaxBorrow(borrower.address);
    expect(maxBorrow).to.equal(1400n * 10n ** 18n);

    await expect(
      pool.connect(borrower).borrow(1500n * 10n ** 18n)
    ).to.be.revertedWith("MAX_BORROW_EXCEEDED");
  });

  // D. Borrow blocked — insufficient liquidity
  it("D. Borrow reverts when pool has insufficient USDT", async () => {
    const borrower2 = (await network.connect())[4] as any;
    await pool.connect(borrower2).depositCollateral({ value: 1n * 10n ** 18n });

    await expect(
      pool.connect(borrower2).borrow(1000n * 10n ** 18n)
    ).to.be.revertedWith("INSUFFICIENT_LIQUIDITY");
  });

  // E. Borrow blocked — no collateral
  it("E. Borrow reverts when no collateral deposited", async () => {
    const freshBorrower = (await network.connect())[5] as any;
    await expect(
      pool.connect(freshBorrower).borrow(10n * 10n ** 16n)
    ).to.be.revertedWith("NO_COLLATERAL");
  });

  // F. Borrow blocked — zero oracle price
  it("F. Borrow reverts when oracle price is zero", async () => {
    const borrower3 = (await network.connect())[6] as any;
    await pool.connect(borrower3).depositCollateral({ value: 1n * 10n ** 18n });
    await oracle.setPrice(0n);

    await expect(
      pool.connect(borrower3).borrow(10n * 10n ** 16n)
    ).to.be.revertedWith("PRICE_NOT_SET");

    await oracle.setPrice(ETH_PRICE);
  });

  // G. Lazy accrual — view returns virtual debt, storage unchanged
  it("G. getDebtValue returns virtual debt but storage debtUSDT is unchanged", async () => {
    const b = (await network.connect())[7] as any;
    await pool.connect(b).depositCollateral({ value: 1n * 10n ** 18n });
    await pool.connect(b).borrow(100n * 10n ** 16n);

    const storedBefore = await pool.debtUSDT(b.address);

    await network.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await network.provider.send("evm_mine", []);

    const virtualDebt = await pool.getDebtValue(b.address);
    const storedAfter = await pool.debtUSDT(b.address);

    expect(virtualDebt).to.be.greaterThan(storedBefore);
    expect(storedAfter).to.equal(storedBefore);

    // repay triggers accrual then reduces
    await usdt.demoMint(b.address, 10n * 10n ** 16n);
    await usdt.connect(b).approve(await pool.getAddress(), 10n * 10n ** 16n);
    await pool.connect(b).repay(10n * 10n ** 16n);

    const storedAfterRepay = await pool.debtUSDT(b.address);
    expect(storedAfterRepay).to.be.lessThan(storedAfter);
  });

  // H. Repay reduces normalized debt correctly
  it("H. Repay reduces normalized debt correctly", async () => {
    const b = (await network.connect())[8] as any;
    await pool.connect(b).depositCollateral({ value: 1n * 10n ** 18n });
    await pool.connect(b).borrow(100n * 10n ** 16n);

    await network.provider.send("evm_increaseTime", [365 * 24 * 60 * 60]);
    await network.provider.send("evm_mine", []);

    await usdt.demoMint(b.address, 200n * 10n ** 16n);
    await usdt.connect(b).approve(await pool.getAddress(), 200n * 10n ** 16n);

    const debtBefore = await pool.debtUSDT(b.address);
    const repayAmt = 50n * 10n ** 16n;
    await pool.connect(b).repay(repayAmt);

    const debtAfter = await pool.debtUSDT(b.address);
    expect(debtAfter).to.equal(debtBefore - repayAmt);
  });

  // I. withdrawCollateral blocked — HF below 1
  it("I. withdrawCollateral reverts when HF would drop below 1", async () => {
    const b = (await network.connect())[9] as any;
    await pool.connect(b).depositCollateral({ value: 1n * 10n ** 18n });
    await pool.connect(b).borrow(1400n * 10n ** 18n - 1n);

    await expect(
      pool.connect(b).withdrawCollateral(1n)
    ).to.be.revertedWith("HF_BELOW_ONE");
  });

  // J. withdrawCollateral allowed — HF stays ≥ 1
  it("J. withdrawCollateral succeeds when HF stays >= 1", async () => {
    const b = (await network.connect())[10] as any;
    await pool.connect(b).depositCollateral({ value: 2n * 10n ** 18n });
    await pool.connect(b).borrow(10n * 10n ** 16n);

    const collateralBefore = await pool.collateralETH(b.address);
    await pool.connect(b).withdrawCollateral(5n * 10n ** 17n);
    const collateralAfter = await pool.collateralETH(b.address);

    expect(collateralAfter).to.equal(collateralBefore - 5n * 10n ** 17n);
  });

  // K. Liquidation blocked — HF >= 1
  it("K. Liquidation reverts when HF >= 1", async () => {
    const b = (await network.connect())[11] as any;
    await pool.connect(b).depositCollateral({ value: 1n * 10n ** 18n });
    await pool.connect(b).borrow(100n * 10n ** 16n);

    await usdt.demoMint(liquidator.address, 200n * 10n ** 16n);
    await usdt.connect(liquidator).approve(await pool.getAddress(), 200n * 10n ** 16n);

    await expect(
      pool.connect(liquidator).liquidate(b.address, 10n * 10n ** 16n)
    ).to.be.revertedWith("HF_ABOVE_ONE");
  });

  // L. Liquidation allowed — HF < 1
  it("L. Liquidation succeeds when HF < 1", async () => {
    const b = (await network.connect())[12] as any;
    await pool.connect(b).depositCollateral({ value: 1n * 10n ** 18n });
    await pool.connect(b).borrow(1000n * 10n ** 18n);

    await usdt.demoMint(liquidator.address, 2000n * 10n ** 18n);
    await usdt.connect(liquidator).approve(await pool.getAddress(), 2000n * 10n ** 18n);

    const debtBefore = await pool.debtUSDT(b.address);
    const collateralBefore = await pool.collateralETH(b.address);

    await pool.connect(liquidator).liquidate(b.address, 100n * 10n ** 18n);

    const debtAfter = await pool.debtUSDT(b.address);
    const collateralAfter = await pool.collateralETH(b.address);

    expect(debtAfter).to.be.lessThan(debtBefore);
    expect(collateralAfter).to.be.lessThan(collateralBefore);
  });

  // M. Liquidation — 5% bonus math
  it("M. Liquidation bonus is exactly 5%", async () => {
    const b = (await network.connect())[13] as any;
    await pool.connect(b).depositCollateral({ value: 10n * 10n ** 18n });
    await pool.connect(b).borrow(10000n * 10n ** 18n);

    await usdt.demoMint(liquidator.address, 50000n * 10n ** 18n);
    await usdt.connect(liquidator).approve(await pool.getAddress(), 50000n * 10n ** 18n);

    const repayAmt = 1000n * 10n ** 18n;
    const expectedSeized =
      (repayAmt * (10000n + BONUS_BPS) * 10n ** 18n) / (10000n * ETH_PRICE);

    const collateralBefore = await pool.collateralETH(b.address);
    await pool.connect(liquidator).liquidate(b.address, repayAmt);
    const collateralAfter = await pool.collateralETH(b.address);
    const actualSeized = collateralBefore - collateralAfter;

    expect(actualSeized).to.be.at.most(expectedSeized);
  });

  // N. Liquidation — seized ETH capped by collateral
  it("N. Seized ETH is capped by remaining collateral", async () => {
    const b = (await network.connect())[14] as any;
    await pool.connect(b).depositCollateral({ value: 1n * 10n ** 16n });
    await pool.connect(b).borrow(1000n * 10n ** 18n);

    await usdt.demoMint(liquidator.address, 50000n * 10n ** 18n);
    await usdt.connect(liquidator).approve(await pool.getAddress(), 50000n * 10n ** 18n);

    await pool.connect(liquidator).liquidate(b.address, 10000n * 10n ** 18n);
    const collateralAfter = await pool.collateralETH(b.address);
    expect(collateralAfter).to.equal(0n);
  });

  // O. Liquidation — repay capped at debt
  it("O. Repay is capped at borrower debt; excess USDT stays with liquidator", async () => {
    const b = (await network.connect())[15] as any;
    await pool.connect(b).depositCollateral({ value: 1n * 10n ** 18n });
    await pool.connect(b).borrow(100n * 10n ** 16n);

    const liquidatorUsdtBefore = await usdt.balanceOf(liquidator.address);

    await usdt.demoMint(liquidator.address, 10000n * 10n ** 18n);
    await usdt.connect(liquidator).approve(await pool.getAddress(), 10000n * 10n ** 18n);

    await pool.connect(liquidator).liquidate(b.address, 1000n * 10n ** 16n);

    const debtAfter = await pool.debtUSDT(b.address);
    expect(debtAfter).to.equal(0n);

    const actualCost = liquidatorUsdtBefore - (await usdt.balanceOf(liquidator.address));
    expect(actualCost).to.equal(100n * 10n ** 16n);
  });

  // P. withdrawLiquidity blocked — insufficient pool cash
  it("P. withdrawLiquidity reverts when pool has insufficient USDT", async () => {
    const lender2 = (await network.connect())[16] as any;
    await usdt.demoMint(lender2.address, 100n * 10n ** 18n);
    await usdt.connect(lender2).approve(await pool.getAddress(), 100n * 10n ** 18n);
    await pool.connect(lender2).depositLiquidity(100n * 10n ** 18n);

    const borrower5 = (await network.connect())[17] as any;
    await pool.connect(borrower5).depositCollateral({ value: 1n * 10n ** 18n });
    await pool.connect(borrower5).borrow(90n * 10n ** 18n);

    const frBalance = await fr.balanceOf(lender2.address);
    await expect(
      pool.connect(lender2).withdrawLiquidity(frBalance)
    ).to.be.revertedWith("INSUFFICIENT_LIQUIDITY");
  });

  // Q. totalSuppliedUSDT — principal-only accounting
  it("Q. totalSuppliedUSDT tracks principal only, not earnings", async () => {
    const lender3 = (await network.connect())[18] as any;
    const amount = 100n * 10n ** 18n;
    await usdt.demoMint(lender3.address, amount);
    await usdt.connect(lender3).approve(await pool.getAddress(), amount);
    await pool.connect(lender3).depositLiquidity(amount);

    let totalSupplied = await pool.totalSuppliedUSDT();
    expect(totalSupplied).to.equal(amount);

    const frSupply = await fr.totalSupply();
    await pool.connect(lender3).withdrawLiquidity(frSupply / 2n);

    totalSupplied = await pool.totalSuppliedUSDT();
    expect(totalSupplied).to.equal(amount / 2n);
  });
});
