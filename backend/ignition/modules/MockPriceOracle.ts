import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MockPriceOracleModule = buildModule("MockPriceOracleModule", (m) => {
  const mockPriceOracle = m.contract("MockPriceOracle");
  return { mockPriceOracle };
});

export default MockPriceOracleModule;

