export type PoolActivityUnit = "ETH" | "USDT" | "RAW";

export function getPoolActivityUnit(eventName: string): PoolActivityUnit {
  if (eventName === "DepositCollateral" || eventName === "WithdrawCollateral") return "ETH";
  if (
    eventName === "DepositLiquidity" ||
    eventName === "WithdrawLiquidity" ||
    eventName === "Borrow" ||
    eventName === "Repay" ||
    eventName === "Liquidate"
  ) {
    return "USDT";
  }
  return "RAW";
}

export function getPoolActivityLabel(eventName: string): string {
  switch (eventName) {
    case "DepositLiquidity":
      return "Deposit Liquidity (USDT)";
    case "WithdrawLiquidity":
      return "Withdraw Liquidity (USDT)";
    case "DepositCollateral":
      return "Deposit Collateral (ETH)";
    case "WithdrawCollateral":
      return "Withdraw Collateral (ETH)";
    case "Borrow":
      return "Borrow (USDT)";
    case "Repay":
      return "Repay (USDT)";
    case "Liquidate":
      return "Liquidate Position";
    default:
      return eventName;
  }
}

export function formatPoolActivityAmountBaseUnits(amountBaseUnits: string | null, eventName: string): string {
  if (!amountBaseUnits) return "—";
  const unit = getPoolActivityUnit(eventName);
  if (unit === "RAW") return amountBaseUnits;

  try {
    const n = BigInt(amountBaseUnits);
    const whole = n / 10n ** 18n;
    const frac = (n % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
    const wholeFmt = Number(whole).toLocaleString("en-US");
    return frac ? `${wholeFmt}.${frac} ${unit}` : `${wholeFmt} ${unit}`;
  } catch {
    return `${amountBaseUnits} ${unit}`;
  }
}
