import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const FRTokenModule = buildModule("FRTokenModule", (m) => {
  const frToken = m.contract("FRToken");
  return { frToken };
});

export default FRTokenModule;

