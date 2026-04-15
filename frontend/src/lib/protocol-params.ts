/**
 * On-chain parameters mirrored from `backend/contracts/LendingPool.sol`.
 * Keep in sync when Solidity constants change.
 */

export const BPS_DENOMINATOR = 10_000;

/** Max debt (principal + accrued) as % of collateral value — borrow ceiling */
export const MAX_LTV_BPS = 7000;

/** Liquidation when debt exceeds this fraction of collateral value (not the same as max borrow LTV) */
export const LIQUIDATION_THRESHOLD_BPS = 8000;

/** Extra collateral value liquidator receives vs strict “fair” seizure (5%) */
export const LIQUIDATION_BONUS_BPS = 500;

/** Share of accrued interest sent to protocol reserves */
export const RESERVE_FACTOR_BPS = 1000;

/** Two-slope borrow APY model */
export const BASE_BORROW_APY_BPS = 200;
export const OPTIMAL_UTIL_BPS = 8000;
export const SLOPE1_BPS = 1000;
export const SLOPE2_BPS = 4000;

/** Health factor & oracle fixed-point scale */
export const WAD = 10n ** 18n;

/** HF below this (1.0 in WAD) → liquidatable */
export const HF_ONE = 10n ** 18n;

/**
 * Current debt as a fraction of collateral value, in bps (10_000 = 100%).
 * Uses the same USDT-valued debt and collateral as the pool’s risk checks.
 */
export function debtToCollateralRatioBps(debt: bigint, collateralValueUsdt: bigint): bigint | undefined {
  if (collateralValueUsdt === 0n) return undefined;
  return (debt * BigInt(BPS_DENOMINATOR)) / collateralValueUsdt;
}

/** Same liquidation line as the contract: debt above LIQUIDATION_THRESHOLD_BPS of collateral value. */
export function isDebtAboveLiquidationLine(debt: bigint, collateralValueUsdt: bigint): boolean {
  if (debt === 0n) return false;
  if (collateralValueUsdt === 0n) return true;
  return debt * BigInt(BPS_DENOMINATOR) > collateralValueUsdt * BigInt(LIQUIDATION_THRESHOLD_BPS);
}

/**
 * Same logic as `LendingPool._computeBorrowAPY(utilBps)` (returns APY in bps).
 */
export function computeBorrowApyBps(utilBps: number): number {
  const u = Math.max(0, Math.min(BPS_DENOMINATOR, Math.floor(utilBps)));
  if (u <= OPTIMAL_UTIL_BPS) {
    return BASE_BORROW_APY_BPS + Math.floor((u * SLOPE1_BPS) / OPTIMAL_UTIL_BPS);
  }
  const excess = u - OPTIMAL_UTIL_BPS;
  const denom = BPS_DENOMINATOR - OPTIMAL_UTIL_BPS;
  return BASE_BORROW_APY_BPS + SLOPE1_BPS + Math.floor((excess * SLOPE2_BPS) / denom);
}

/**
 * Same as `getSupplyAPY()` in Solidity (returns APY in bps).
 */
export function computeSupplyApyBps(utilBps: number): number {
  const borrow = computeBorrowApyBps(utilBps);
  const u = Math.max(0, Math.min(BPS_DENOMINATOR, Math.floor(utilBps)));
  return Math.floor((borrow * u * (BPS_DENOMINATOR - RESERVE_FACTOR_BPS)) / BPS_DENOMINATOR / BPS_DENOMINATOR);
}

/** Convert bps to a percentage number (e.g. 250 → 2.5) */
export function bpsToPercentNumber(bps: number): number {
  return bps / 100;
}

/** Display string like "2.50%" from bps */
export function formatBpsAsPercent(bps: number, fractionDigits = 2): string {
  return `${bpsToPercentNumber(bps).toFixed(fractionDigits)}%`;
}

/** Table rows for documentation — example utilizations */
export const EXAMPLE_UTIL_BPS = [0, 4000, 8000, 9000, 10_000] as const;
