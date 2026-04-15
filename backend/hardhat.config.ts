import "@nomicfoundation/hardhat-ignition";

import path from "node:path";
import { fileURLToPath } from "node:url";

import { setMockCacheDir } from "@nomicfoundation/hardhat-utils/global-dir";
import { defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";

// Hardhat v3 uses a hard-link based mutex for downloading/refreshing solc
// compiler metadata in its global cache. In some environments that can cause
// a mutex timeout, so for this repo we redirect the cache to a local folder.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
setMockCacheDir(path.join(__dirname, ".hardhat-test-cache"));

export default defineConfig({
  plugins: [hardhatToolboxViem, hardhatNodeTestRunner],
  networks: {
    localhost: {
      type: "http",
      chainId: 31337,
      url: "http://127.0.0.1:8545",
    },
  },
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
});
