# LendFi Hardhat

## Local node + deployments

1. Start Hardhat:

```bash
npx hardhat node
```

2. Deploy (Ignition):

```bash
npx hardhat ignition deploy ignition/modules/LendingPool.ts --network localhost
```

3. Copy deployed addresses into `frontend/.env` (`NEXT_PUBLIC_*`).

## Mint MockUSDT to test accounts

Hardhat’s local node exposes **20 default accounts** — you **do not** need to fund all 20 unless you want to. Fund as many addresses as you need for testing.

After `hardhat node` is running and contracts are deployed, from the `hardhat/` folder:

```bash
npm run mint:usdt
```

Or with explicit flags:

```bash
node --import tsx/esm ./scripts/mint-mock-usdt.ts --network localhost --accounts 5 --amount 10000
```

Address resolution order for MockUSDT:

1. `--usdt 0x...`
2. `MOCK_USDT_ADDRESS` or `NEXT_PUBLIC_MOCK_USDT_ADDRESS`
3. `ignition/deployments/chain-31337/deployed_addresses.json` (`MockUSDTModule#MockUSDT`)

Notes:

- `MockUSDT.demoMint` is **`onlyOwner`**, so the script uses account `#0` as the minter by default (`--deployer-index`).
- Restarting `hardhat node` / redeploying resets chain state — rerun deploy + mint as needed.

## Liquidations page (frontend)

The pool stores debt per address but does not expose “all borrowers” on-chain. The app discovers
liquidatable positions by multicalling `getHealthFactor` / `debt` / `collateral` over a configured
candidate address list (defaults + optional `NEXT_PUBLIC_LIQUIDATION_CANDIDATES` in the frontend).
It then targets the **lowest health factor** among underwater loans in that set. For a production
deployment you would add a borrower registry and/or an indexer.
