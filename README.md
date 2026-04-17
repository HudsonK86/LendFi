# LendFi Hha

LendFi is a full-stack lending protocol demo with:

- Smart contracts and deployment/testing in `backend/`
- Web app and indexer in `frontend/`
- PostgreSQL schema in `db/schema.sql`

## Codebase structure

This project has 3 major parts:

1. `backend/` - smart contracts, tests, and deployment scripts
2. `frontend/` - Next.js web app, API routes, and indexer
3. `db/` - PostgreSQL schema for analytics/admin data

```text
LendFi/
├─ backend/                     # Hardhat workspace
│  ├─ contracts/                # Solidity contracts
│  │  ├─ LendingPool.sol        # Core lending logic
│  │  ├─ FRToken.sol            # Pool share token
│  │  ├─ MockUSDT.sol           # Test stablecoin
│  │  └─ MockPriceOracle.sol    # Test ETH/USDT oracle
│  ├─ ignition/modules/         # Deployment modules
│  ├─ scripts/                  # Deploy/mint/env sync helpers
│  ├─ test/                     # Contract tests
│  └─ hardhat.config.ts         # Backend config
│
├─ frontend/                    # Next.js app
│  ├─ app/                      # Routes + pages + API endpoints
│  │  ├─ pool/                  # Supply/withdraw module
│  │  ├─ borrow/                # Borrow/repay/collateral module
│  │  ├─ dashboard/             # Account + protocol overview
│  │  └─ api/                   # Server endpoints (admin/analytics)
│  ├─ src/
│  │  ├─ components/            # Reusable UI blocks
│  │  ├─ context/               # Web3 provider context
│  │  ├─ abi/                   # ABI facade exports
│  │  ├─ utils/                 # Utility helpers
│  │  └─ lib/                   # Shared domain/app logic
│  └─ scripts/indexer.ts        # Blockchain event indexer -> DB
│
├─ db/
│  └─ schema.sql                # Tables for admin + analytics
└─ README.md
```

## Architecture (how data flows)

In simple terms:

- Blockchain (`backend`) stores the real lending state.
- Frontend (`frontend`) lets users interact with contracts.
- Database (`db`) stores indexed history and analytics for fast querying.

End-to-end flow:

1. User clicks an action in UI (deposit, borrow, repay, liquidate).
2. Wallet signs and sends transaction to the local chain.
3. Contract state changes on-chain.
4. Contracts emit events.
5. `frontend/scripts/indexer.ts` reads events and writes rows into PostgreSQL tables.
6. Dashboard/Admin pages read DB plus on-chain values and render metrics.

Why both blockchain and DB:

- Blockchain = source of truth for financial state.
- Database = fast history/analytics queries that are expensive to do directly from chain.

Recommended learning path for beginners:

1. Read `backend/contracts/LendingPool.sol` (core protocol behavior).
2. Read `backend/test/LendingPool.test.ts` (expected behavior and edge cases).
3. Open `frontend/app/pool` and `frontend/app/borrow` (how UI triggers contract calls).
4. Read `frontend/scripts/indexer.ts` (how events are transformed into DB rows).
5. Check `db/schema.sql` (what data is stored and why).

## Core features

- Shared liquidity pool where users deposit USDT and receive FRToken shares.
- Borrowing against ETH collateral with LTV and liquidation threshold protections.
- Interest accrual and debt tracking inside the pool contract.
- Liquidation flow for unhealthy positions.
- Real-time protocol analytics indexed into PostgreSQL.
- Admin features for login/session and oracle price updates with audit logs.

## Repository structure

- `backend/`
  - `contracts/` Solidity contracts (`LendingPool`, `FRToken`, `MockUSDT`, `MockPriceOracle`)
  - `ignition/modules/` deployment modules
  - `scripts/` helper scripts (mint, env sync, verification)
  - `test/` Hardhat test suite
  - `hardhat.config.ts` backend network/compiler config
- `frontend/`
  - `app/` Next.js App Router pages and API routes
  - `src/` shared components, abi facade, context, utils, formatting helpers
  - `scripts/indexer.ts` event indexer that writes analytics to DB
- `db/`
  - `schema.sql` database schema for admin and protocol analytics tables

## Prerequisites

- Node.js (LTS)
- npm
- PostgreSQL (for frontend API/indexer analytics routes)

## Install dependencies

Run once:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## Required environment variables

Create `frontend/.env` and set at least the following:

```bash
# Required by frontend server-side API routes and indexer DB reads/writes
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/lendfi

# Required by admin session auth (must be >= 32 chars)
IRON_SESSION_PASSWORD=<a-long-random-secret-at-least-32-chars>

# Required by admin bootstrap endpoint (/api/admin/init)
ADMIN_DB_INIT_SECRET=<admin-init-secret>

# Web3 / protocol wiring (set by backend sync script)
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_LENDING_POOL_ADDRESS=0x...
NEXT_PUBLIC_MOCK_USDT_ADDRESS=0x...
NEXT_PUBLIC_FRTOKEN_ADDRESS=0x...
NEXT_PUBLIC_MOCK_PRICE_ORACLE_ADDRESS=0x...
```

Optional but recommended:

```bash
# AppKit wallet project id (if omitted, app still runs with local fallback)
NEXT_PUBLIC_PROJECT_ID=<walletconnect-project-id>

# Optional list for liquidation scan candidates
NEXT_PUBLIC_LIQUIDATION_CANDIDATES=0xabc...,0xdef...
```

## Database setup

1) Create the database:

```bash
createdb lendfi
```

2) Apply schema:

```bash
psql "postgresql://<user>:<password>@localhost:5432/lendfi" -f db/schema.sql
```

If your local Postgres uses defaults, this also works:

```bash
psql -d lendfi -f db/schema.sql
```

## Step-by-step run guide (local development)

Run each step in order:

1) Start the local blockchain node:

```bash
cd backend
npm run node
```

2) Deploy contracts + mint mock USDT + sync frontend env addresses:

```bash
cd backend
npm run deploy
```

3) Start frontend web + indexer:

```bash
cd frontend
npm run dev:all
```

4) Open the app:

- Web app: [http://localhost:3000](http://localhost:3000)
- Optional admin login page: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

5) Initialize the first admin account (one-time per database):

```bash
curl -X POST http://localhost:3000/api/admin/init \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "change-me-now",
    "secret": "<same-value-as-ADMIN_DB_INIT_SECRET-in-frontend/.env>"
  }'
```

Expected result:

- `201` with `{"username":"admin"}` on first successful initialization
- `409` if an admin account already exists in `admin_users`

If you only want the web app without indexer:

```bash
cd frontend
npm run dev:web
```

If you only want the indexer process:

```bash
cd frontend
npm run indexer
```

## Deployment workflow (local chain / demo)

Daily redeploy flow:

1. Keep `npm run node` running in `backend/`.
2. Re-run `npm run deploy` in `backend/` after contract changes or node reset.
3. Restart frontend processes if env addresses changed.

Notes:

- Restarting the Hardhat node resets chain state.
- After reset, always redeploy and re-mint before testing UI flows.
- Admin initialization is tied to DB state. If you recreate or truncate admin tables, run the init request again.

## Backend commands

From `backend/`:

- `npm run compile` - compile contracts
- `npm run test` - run contract tests
- `npm run node` - start local Hardhat node
- `npm run deploy` - deploy + mint + sync frontend env
- `npm run mint:usdt` - mint mock USDT to local accounts
- `npm run sync:frontend-env` - write deployed contract addresses to `frontend/.env`

## Frontend commands

From `frontend/`:

- `npm run dev` - Next.js dev server
- `npm run dev:all` - Next.js + indexer together
- `npm run indexer` - protocol event indexer only
- `npm run lint` - lint
- `npm run build` - production build

## Verification / smoke checklist

Before pushing changes:

```bash
cd backend && npm run compile && npm run test
cd ../frontend && npm run lint && npm run build
```

Manual smoke:

- Connect wallet in UI.
- Supply liquidity in Pool page.
- Deposit ETH collateral and borrow in Borrow page.
- Verify analytics/events update in Dashboard and Protocol/Admin analytics pages.

## Generated files policy

Generated backend Hardhat outputs are intentionally not versioned:

- `backend/artifacts/`
- `backend/cache/`
- `backend/ignition/deployments/`

They are recreated as needed by compile/test/deploy commands.

## Notes

- Local deploy/test flows assume chain id `31337`.
- Frontend liquidation scanning is demo-oriented and uses a configured candidate list; production setups should use a borrower registry and/or indexer-driven discovery.
- Contracts are intentionally lending-specific; structure matches lecturer-style stack, not ICO business logic.

## PostgreSQL CLI quick reference

Connect:

```bash
psql "postgresql://<user>:<password>@localhost:5432/lendfi"
```

Common inspection commands inside `psql`:

```sql
-- List tables
\dt

-- Describe table structure
\d pool_activity

-- Count rows in all core tables
SELECT 'admin_users' AS table_name, COUNT(*) FROM admin_users
UNION ALL SELECT 'admin_action_logs', COUNT(*) FROM admin_action_logs
UNION ALL SELECT 'indexer_state', COUNT(*) FROM indexer_state
UNION ALL SELECT 'pool_activity', COUNT(*) FROM pool_activity
UNION ALL SELECT 'pool_market_snapshots', COUNT(*) FROM pool_market_snapshots;

-- Latest indexed protocol events
SELECT event_name, user_address, amount_base_units, block_number, created_at
FROM pool_activity
ORDER BY block_number DESC, log_index DESC
LIMIT 20;

-- Latest admin actions
SELECT username, action, details, created_at
FROM admin_action_logs
ORDER BY created_at DESC
LIMIT 20;

-- Latest market snapshots
SELECT block_number, total_liquidity_base_units, total_borrowed_base_units, utilization_bps, created_at
FROM pool_market_snapshots
ORDER BY block_number DESC, created_at DESC
LIMIT 20;

-- Latest 20 admin users
SELECT id, username, created_at
FROM admin_users
ORDER BY created_at DESC
LIMIT 20;

-- Latest 20 indexer checkpoints
SELECT key, value, updated_at
FROM indexer_state
ORDER BY updated_at DESC
LIMIT 20;

-- Latest 20 rows per core table (quick copy/paste set)
SELECT * FROM admin_users ORDER BY created_at DESC LIMIT 20;
SELECT * FROM admin_action_logs ORDER BY created_at DESC LIMIT 20;
SELECT * FROM indexer_state ORDER BY updated_at DESC LIMIT 20;
SELECT * FROM pool_activity ORDER BY block_number DESC, log_index DESC LIMIT 20;
SELECT * FROM pool_market_snapshots ORDER BY block_number DESC, created_at DESC LIMIT 20;
```
