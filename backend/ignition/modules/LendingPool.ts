import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

import MockUSDTModule from "./MockUSDT.js";
import MockPriceOracleModule from "./MockPriceOracle.js";
import FRTokenModule from "./FRToken.js";

const LendingPoolModule = buildModule("LendingPoolModule", (m) => {
  const { mockUSDT } = m.useModule(MockUSDTModule);
  const { mockPriceOracle } = m.useModule(MockPriceOracleModule);
  const { frToken } = m.useModule(FRTokenModule);

  // Deploy in the same module to guarantee the constructor arg wiring.
  const lendingPool = m.contract("LendingPool", [mockUSDT, mockPriceOracle, frToken]);

  // Wire the FRToken minter/burner restriction placeholder so lending pool can mint/burn later.
  m.call(frToken, "setLendingPool", [lendingPool]);

  return {
    lendingPool,
    mockUSDT,
    mockPriceOracle,
    frToken,
  };
});

export default LendingPoolModule;

