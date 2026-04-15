import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MockUSDTModule = buildModule("MockUSDTModule", (m) => {
  const mockUSDT = m.contract("MockUSDT");
  return { mockUSDT };
});

export default MockUSDTModule;

