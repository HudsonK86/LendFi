# Implementation Plan — LendFi Shared-Pool Lending (Admin + MetaMask Roles)

<!-- PLAN_BEGIN: Only use content between PLAN_BEGIN and PLAN_END -->

## 0. Goal (Build From Scratch)
Create a simplified **shared-pool lending** DApp for a school project:

1. **Lenders** deposit **MockUSDT** into one shared pool and receive **FR** (pool share token).
2. **Borrowers** deposit **native ETH** as collateral and borrow **MockUSDT**.
3. **Liquidators** can liquidate when a borrower’s **Health Factor (HF) < 1**.
4. **Admin** controls mock ETH price.

Identity model:
- **Lenders / Borrowers / Liquidators**: only need to connect **MetaMask** (role = Ethereum address).
- **Admin**: can access the admin page with **username/password** (hashed + salted in PostgreSQL), but **on-chain admin actions** must be sent via **MetaMask** from an authorized admin wallet.
- **Do not use backend transaction signing** for admin actions.

Hard constraints:
- Use **native ETH** collateral only, handled through `payable` functions in `LendingPool`.
- Do **not** implement any ETH wrapper token such as `MockWETH`.
- Use real pool liquidity checks using the USDT balance held by the pool contract:
  - `availableLiquidity = MockUSDT.balanceOf(address(this))`
- Enforce explicit **lazy debt normalization** before any borrower-sensitive action or validation.

---

## 1. Tech Stack (Keep Same as Existing Repo)

Frontend (TypeScript):
- Next.js 16 (App Router) + React + TypeScript
- Tailwind CSS
- `wagmi` + `viem`
- `@reown/appkit` + `@reown/appkit-adapter-wagmi`
- `@tanstack/react-query`
- `react-toastify`
- `nodemon` (optional; auto-restarts dev server when config/env files change)

Backend / API (TypeScript):
- Next.js Route Handlers in `frontend/src/app/api/...`
- PostgreSQL + `pg` with parameterized SQL

Blockchain:
- Hardhat 3
- Solidity `0.8.28`
- Hardhat Ignition
- Hardhat tests (TypeScript, node test runner)

---

## 2. On-Chain Assets & Contracts (Exact List)

Assets:
- **MockUSDT** (ERC-20): lending / borrowing / repayment / liquidation repay asset
- **ETH** (native): borrower collateral
- **FR** (ERC-20): pool share token

Contracts to implement (exactly 4 files):
1. `MockUSDT.sol`
2. `FRToken.sol`
3. `MockPriceOracle.sol`
4. `LendingPool.sol`

Notes:
- ETH is native and stored/transferred by `LendingPool` using `payable` functions and native ETH transfers.
- No separate ETH token contract is needed.

---

## 3. Financial Rules (Must Match the LendFi Guide)

### 3.1 Borrowing Limits
- **Max LTV = 70%**
- Borrow is allowed only if, after lazy debt normalization:
  - borrower collateral exists
  - new debt value <= `maxBorrow = collateralValue * 70%`
  - `borrowAmount <= availableLiquidity` using the real USDT balance check

### 3.2 Health Factor & Liquidation
- **Liquidation Threshold = 80%**
- `HF = (CollateralValue * LiquidationThreshold) / DebtValue`
- Liquidation trigger: `HF < 1`

Liquidation rules:
- Liquidator may repay up to **100%** of borrower outstanding debt
- **Liquidation Bonus = 5%**
- Collateral seizure:
  - `CollateralSeized = RepayAmount * (1 + LiquidationBonus) / CollateralPrice`
  - `CollateralPrice` = oracle ETH price (USDT per 1 ETH)
- Seizure must be capped by borrower’s remaining collateral

Liquidation workflow:
1. liquidator repays debt in USDT
2. pool transfers seized ETH collateral to liquidator (+ bonus)
3. borrower debt decreases or becomes zero

### 3.3 Interest Accrual (Simple Linear; Lazy Update)
Borrower debt grows according to:
- `Interest = DebtBase * APY * (ElapsedTime / 365 days)`
- `DebtValue = DebtBase + AccruedInterest`

Where `DebtBase` refers to the borrower’s current normalized stored debt base (`debtUSDT`).

Implementation choice:
- Interest must be applied **lazily** only when borrower-sensitive actions or validations occur.

### 3.4 Utilization-Based Interest Model (Two-Slope)
Utilization:
- `Utilization = TotalBorrowed / TotalSupplied`

Parameters:
- Base Borrow APY = 2%
- Optimal Utilization = 80%
- Slope1 = 10%
- Slope2 = 40%
- Reserve Factor = 10%

Borrow APY:
- If `Utilization <= OptimalUtilization`:
  - `BorrowAPY = BaseRate + (Utilization / OptimalUtilization) * Slope1`
- If `Utilization > OptimalUtilization`:
  - `BorrowAPY = BaseRate + Slope1 + ((Utilization - OptimalUtilization) / (1 - OptimalUtilization)) * Slope2`

Supply APY:
- `SupplyAPY = BorrowAPY * Utilization * (1 - ReserveFactor)`

### 3.5 Liquidity & Withdrawal Checks (Must Use Real USDT Balance)
Conceptual:
- `AvailableLiquidity = TotalSupplied - TotalBorrowed`

Implementation note:
- In Solidity, for borrowing and withdrawal checks, use:
  - `availableLiquidity = MockUSDT.balanceOf(address(this))`

Rules:
- Borrow must require `borrowAmount <= availableLiquidity`
- Withdraw must require redeem amount <= available liquidity

### 3.6 FR Share Accounting (Share-Based Ownership)
First deposit:
- `1 USDT deposited = 1 FR minted`

Later deposits:
- `SharesMinted = DepositAmount * TotalShares / PoolValue`

Withdraw / redeem:
- `WithdrawAmount = UserShares * PoolValue / TotalShares`

PoolValue (MVP interpretation):
- PoolValue represents the total claim value backed by:
  - on-contract USDT balance
  - outstanding borrower debt
  - minus protocol reserves

Even with share math:
- withdrawals must still respect real liquidity checks from section 3.5

---

## 4. Mandatory Lazy Debt Normalization (Borrower Debt & HF)

Borrower state variable naming requirement:
- `collateralETH[borrower]`
- `debtUSDT[borrower]`
- `lastAccrualTimestamp[borrower]`

Debt normalization algorithm (mandatory):
Before any borrower-sensitive action or validation:
1. `elapsed = block.timestamp - lastAccrualTimestamp[borrower]`
2. compute accrued interest using the **current borrow APY**
3. `debtUSDT[borrower] += accruedInterest`
4. `lastAccrualTimestamp[borrower] = block.timestamp`

Interpretation:
- After each normalization, `debtUSDT` is the normalized stored debt base for HF, max borrow, liquidation, and repayment math.

Apply before:
- `borrow()`
- `repay()`
- `withdrawCollateral()`
- `liquidate()`
- any HF / debt / limit validation

First-time borrowers:
- define behavior for unset timestamps, for example set the timestamp and accrue 0

---

## 5. Off-Chain Responsibilities (DB + Admin UI)

PostgreSQL:
- stores metadata / logs / summaries only
- does **not** store financial balances as source of truth

Admin login:
- username/password stored as `password_hash + salt` in DB
- server validates by hashing submitted password with stored salt
- admin page protected by session cookie

On-chain admin actions:
- admin page login is UI authorization only
- actual transactions must be signed and sent from MetaMask by the authorized admin wallet
- contracts must enforce admin authorization on-chain using `msg.sender`

---

## 7. Units, Scaling, and Accounting Rules (Must Follow Exactly)

### 7.1 Token and price precision
- `MockUSDT` uses **18 decimals**
- `FRToken` uses **18 decimals**
- ETH amounts use native wei units
- Oracle ETH price is stored with **1e18 fixed-point precision**
  - meaning: `ethPrice` = USDT value per 1 ETH scaled by `1e18`

### 7.2 Percentage representation
Use **basis points (bps)** for protocol percentages:
- Max LTV = `7000`
- Liquidation Threshold = `8000`
- Liquidation Bonus = `500`
- Reserve Factor = `1000`
- Base Borrow APY = `200`
- Optimal Utilization = `8000`
- Slope1 = `1000`
- Slope2 = `4000`

### 7.2.1 Utilization representation
- Utilization must be computed in **basis points (bps)**.
- Formula:

`utilizationBps = totalBorrowedUSDT * 10000 / totalSuppliedUSDT`

Rules:
- if `totalSuppliedUSDT == 0`, treat utilization as `0`
- `utilizationBps` must be used in the two-slope borrow APY calculation
- the resulting borrow APY must also be expressed in **bps**

### 7.3 Borrower debt model
- `debtUSDT[borrower]` is the borrower’s normalized stored debt base
- There is no separate long-term `principalUSDT` variable in MVP
- Interest accrues using simple linear accrual on the borrower’s current normalized debt base
- After each lazy-accrual update, the new `debtUSDT` becomes the updated base for future accrual

### 7.4 Aggregate accounting variables
Track these protocol-level variables:
- `totalSuppliedUSDT`
- `totalBorrowedUSDT`
- `totalReservesUSDT`

Rules:
- `totalSuppliedUSDT` increases when lenders deposit and decreases when lenders withdraw principal value
- `totalBorrowedUSDT` increases when borrowers borrow
- `totalBorrowedUSDT` decreases when borrowers repay
- when `_updateBorrowerDebt(borrower)` adds accrued interest, `totalBorrowedUSDT` must also increase by the same borrower debt increment

### 7.5 Reserve accounting
When accrued interest is added during lazy debt normalization:
- split accrued interest into:
  - reserve portion = `accruedInterest * reserveFactor / 10000`
  - lender-value portion = remaining accrued interest
- add reserve portion into `totalReservesUSDT`

### 7.6 Pool value for FR share accounting
For MVP, define:

`poolValue = availableLiquidity + totalBorrowedUSDT - totalReservesUSDT`

Where:
`availableLiquidity = MockUSDT.balanceOf(address(this))`

This `poolValue` is used for:
- FR minting on deposit
- FR redemption amount on withdrawal

### 7.7 Contract authorization rule
- Username/password login only grants access to the admin UI
- It does **not** authorize smart contract calls by itself
- Smart contracts must enforce admin rights using `msg.sender`
- Only the authorized admin wallet may call admin-only contract functions

### 7.8 APY-to-interest conversion rule
- All APY values are stored in **basis points (bps)**.
- `10000 bps = 100%`
- Interest accrual must use:

`accruedInterest = debtUSDT * borrowAPYBps * elapsed / (365 days * 10000)`

Where:
- `debtUSDT` is the borrower’s normalized stored debt base
- `borrowAPYBps` is the current borrow APY in basis points
- `elapsed` is the time since the last accrual update in seconds

### 7.9 Exact integer formulas and view behavior

#### 7.9.1 Collateral value
Use oracle price scaled by `1e18`.

Formula:
`collateralValueUSDT = collateralETH * ethPrice / 1e18`

Where:
- `collateralETH` is in wei
- `ethPrice` is USDT per 1 ETH scaled by `1e18`
- result is in USDT smallest units (18 decimals)

#### 7.9.2 Max borrow
Use basis points.

Formula:
`maxBorrowUSDT = collateralValueUSDT * maxLtvBps / 10000`

#### 7.9.3 Health factor representation
Health factor must be computed with `1e18` precision.

Formula:
`healthFactor = collateralValueUSDT * liquidationThresholdBps * 1e18 / (debtUSDT * 10000)`

Liquidation rule:
- if `debtUSDT == 0`, treat health factor as a very large safe value
- a position is liquidatable when:
  - `healthFactor < 1e18`

This means:
- `1e18` represents HF = 1.0

#### 7.9.4 Collateral seized in liquidation
Formula:
`collateralSeized = repayAmount * (10000 + liquidationBonusBps) * 1e18 / (10000 * ethPrice)`

Rules:
- cap `repayAmount` so it cannot exceed borrower debt
- cap `collateralSeized` so it cannot exceed borrower remaining collateral

#### 7.9.5 View-function behavior under lazy accrual
Because lazy accrual only updates storage during state-changing actions:
- view functions must compute **virtual accrued interest in memory** without mutating state
- UI-facing view functions such as:
  - `getDebtValue`
  - `getHealthFactor`
  - `getMaxBorrow`
must return values as if accrual were updated at the current block timestamp

This means:
- state-changing functions use `_updateBorrowerDebt(...)`
- view functions use equivalent read-only calculation logic without writing state

### 7.10 Addendum: Rounding, Liquidation Sequence, and First-Timestamp Rules

#### 7.10.1 Exact rounding rules (Solidity-compatible)
1. All percentage, utilization, APY, collateral value, health factor, and liquidation calculations must use integer arithmetic only.
2. All divisions must use Solidity's natural integer division behavior (floor toward zero for `uint256`), and must not introduce any custom rounding (no round-half-up, no manual remainders-to-closest, no floating-point).
3. Any intermediate multiplication that can overflow must be handled by Solidity-safe ordering/casting (use `uint256` and ensure values are sized so the multiplication stays within `uint256`), but the final division results must follow rule (1)-(2).

####  7.10.2 Exact partial-liquidation update sequence (deterministic order)
Liquidation must follow this exact sequence for a given `borrower` and `repayAmount`:
1. normalize borrower debt first by calling `_updateBorrowerDebt(borrower)` (or performing the equivalent 4-step lazy normalization logic)
2. compute current borrower debt as `currentDebtUSDT` from normalized borrower state (the value used for HF/max-borrow checks)
3. cap `repayAmount` to borrower debt: `repayActual = min(repayAmount, currentDebtUSDT)`
4. compute `collateralSeized` using the liquidation seize formula:
   - `collateralSeized = repayActual * (10000 + liquidationBonusBps) * 1e18 / (10000 * ethPrice)`
5. cap `collateralSeized` to borrower's remaining collateral:
   - `collateralSeizedActual = min(collateralSeized, borrowerCollateralETH)`
6. transfer USDT from liquidator to pool for `repayActual`
7. reduce borrower debt by `repayActual`
8. reduce `totalBorrowedUSDT` by `repayActual` by the same amount as the borrower debt reduction
9. reduce borrower collateral by `collateralSeizedActual`
10. transfer seized ETH to liquidator for exactly `collateralSeizedActual`
11. do not add extra reserves during liquidation itself beyond whatever was already added during earlier lazy debt normalization updates

Notes:
- If `repayActual == 0`, the liquidation should effectively do nothing beyond any required checks.
- Any HF check (`healthFactor < 1e18`) must be evaluated consistently with the same rounding rules above.

#### 7.10.3 First-time borrower timestamp rule (single rule for state + views)
This rule must be used consistently in:
`_updateBorrowerDebt(...)`, `getDebtValue(...)`, `getHealthFactor(...)`, and `getMaxBorrow(...)`.

Rule:
1. If `lastAccrualTimestamp[borrower] == 0`, treat accrued interest as `0`.
2. In state-changing logic (`_updateBorrowerDebt(...)`):
   - when the borrower first receives debt or when `_updateBorrowerDebt(borrower)` is first called, set `lastAccrualTimestamp[borrower] = block.timestamp`.
3. In view logic (`getDebtValue(...)`, `getHealthFactor(...)`, `getMaxBorrow(...)`):
   - simulate the exact same behavior in read-only form: if `lastAccrualTimestamp[borrower] == 0`, compute the same debt value as if accrued interest were `0` at the current block timestamp, without writing to storage.

#### 7.10.4 withdrawCollateral validation order
`withdrawCollateral(withdrawAmount)` must follow this order:
1. call `_updateBorrowerDebt(msg.sender)`
2. compute the borrower’s post-withdraw collateral in memory
3. compute post-withdraw health factor in memory using the reduced collateral and current normalized debt
4. revert if post-withdraw health factor would be `< 1e18`
5. only after passing the check, update borrower collateral storage and transfer ETH out

#### 7.11 Accounting invariant
The protocol must maintain this accounting interpretation:

`poolValue = availableLiquidity + totalBorrowedUSDT - totalReservesUSDT`

Where:
- `availableLiquidity = MockUSDT.balanceOf(address(this))`
- `totalBorrowedUSDT` includes normalized borrower debt already recognized into storage
- `totalReservesUSDT` is the protocol-owned portion of accrued interest and is excluded from lender claim value

Interpretation:
- lender share value is based on `poolValue`
- withdrawal cash availability is based on `availableLiquidity`
- therefore, a lender may have a claim value larger than immediately withdrawable cash if some value is still tied up in active borrower debt

Important rule:
- `withdrawLiquidity()` must compute the user’s redemption value from `poolValue`
- but the actual withdrawal must revert if the redeemable USDT amount is greater than `availableLiquidity`

#### 7.12 Exact lazy-accrual update order
The internal function `_updateBorrowerDebt(borrower)` must follow this exact order:

1. read `oldDebt = debtUSDT[borrower]`
2. if `lastAccrualTimestamp[borrower] == 0`:
   - set `lastAccrualTimestamp[borrower] = block.timestamp`
   - return without adding interest
3. compute `elapsed = block.timestamp - lastAccrualTimestamp[borrower]`
4. if `elapsed == 0` or `oldDebt == 0`:
   - set `lastAccrualTimestamp[borrower] = block.timestamp`
   - return without adding interest
5. compute current `utilizationBps` using current stored aggregate totals before this borrower’s new accrual is added
6. compute current `borrowAPYBps` from the two-slope model using `utilizationBps`
7. compute:
   - `accruedInterest = oldDebt * borrowAPYBps * elapsed / (365 days * 10000)`
8. if `accruedInterest == 0`:
   - set `lastAccrualTimestamp[borrower] = block.timestamp`
   - return
9. compute:
   - `reservePortion = accruedInterest * reserveFactorBps / 10000`
   - `lenderPortion = accruedInterest - reservePortion`
10. update borrower debt:
   - `debtUSDT[borrower] = oldDebt + accruedInterest`
11. update protocol totals:
   - `totalBorrowedUSDT += accruedInterest`
   - `totalReservesUSDT += reservePortion`
12. update timestamp:
   - `lastAccrualTimestamp[borrower] = block.timestamp`

Notes:
- `borrowAPYBps` used for the accrual interval is derived from aggregate stored totals before this borrower’s new accrual increment is added
- reserve allocation happens inside lazy accrual, not during repay or liquidation

#### 7.13 FR mint/redeem rule under lazy accrual
For MVP, FR minting and redemption must use the stored aggregate accounting values currently recognized on-chain.

This means:
- `poolValue` uses:
  - current `availableLiquidity`
  - current stored `totalBorrowedUSDT`
  - current stored `totalReservesUSDT`
- the contract does not iterate through all borrowers to simulate unrecognized accrued interest before every lender deposit or withdrawal
- therefore, FR mint/redeem uses recognized stored totals only, not hypothetical global virtual accrual

Implication:
- borrower-facing views may simulate virtual accrual in memory
- lender share accounting uses currently recognized stored protocol totals only
- this is acceptable for MVP because it keeps gas and implementation complexity low

#### 7.13.1 Deposit-time poolValue snapshot rule
For FR minting on lender deposit, `poolValue` must be measured using the pool state **before** the new deposit amount is added.

This means:
- first transfer/mint logic must conceptually price the new shares against the pre-deposit pool
- for non-first deposits:
  - `sharesMinted = depositAmount * totalShares / poolValueBeforeDeposit`

Reason:
- this avoids giving the depositor an unfair share price caused by including their own deposit in the denominator

#### 7.13.2 FR edge-case rules
- If `totalShares == 0`, treat the deposit as the first deposit and mint FR 1:1 with deposited MockUSDT.
- If `totalShares > 0`, then `poolValue` used for FR mint/redeem must be greater than `0`; otherwise revert.
- `withdrawLiquidity()` must calculate the redeem amount from current recognized `poolValue`, then check whether the resulting redeem amount is `<= availableLiquidity`; if not, revert.

---
## 8. Implementation Steps (Cursor-Friendly, Stop After Each Step)

Cursor rules:
1. Only implement the current step.
2. List files changed.
3. Provide run commands.
4. Provide verification checklist.
5. Stop and wait for approval:
   - `Approved, go Step X+1.`
   - or `Fix Step X: ...`

   

### Step 0 — Create Contract Scaffolding + ABI Placeholders

**Goal:** Create the required project structure so that later steps can implement contracts and UI with minimal rewiring.

#### 1) Create folders
Create top-level folders: `frontend/`, `hardhat/`, `db/`.

#### 2) Scaffold the frontend (Next.js App Router)
In `frontend/`, scaffold Next.js with App Router + TypeScript + Tailwind, and ensure it matches the requirement "no src dir".

- Run: `npm create next-app@latest .`
- Select: App Router, TypeScript, Tailwind
- Choose "no src dir" (so the layout matches the constraint in implement.md).

Enable strict TypeScript:
- Edit `frontend/tsconfig.json` and set `"strict": true`.

#### 3) Initialize the Hardhat TypeScript project
In `hardhat/`:
- Run: `npm init -y`
- Run: `npx hardhat init` and choose the TypeScript project option.
- Install required packages:
  - `npm i -D @nomicfoundation/hardhat-toolbox-viem @nomicfoundation/hardhat-ignition`

#### 4) Add Solidity contract scaffolding (compilable placeholders)
Create these files (with SPDX + pragma + minimal skeletons that compile):
- `hardhat/contracts/MockUSDT.sol`
- `hardhat/contracts/FRToken.sol`
- `hardhat/contracts/MockPriceOracle.sol`
- `hardhat/contracts/LendingPool.sol`

Notes for placeholders:
- Keep them minimal but valid so `npx hardhat compile` succeeds at the end of Step 0.
- Leave TODOs for the actual logic (to be implemented in Step 1+).

#### 5) Add Ignition deployment modules (deploy order)
Create Ignition modules in `hardhat/ignition/modules/`:
- MockUSDT module
- MockPriceOracle module
- FRToken module
- LendingPool module

Deployment order: MockUSDT -> MockPriceOracle -> FRToken -> LendingPool.
Since this is scaffolding, deploy with placeholder constructor args (or none) consistent with the minimal skeletons from step 4.

#### 6) Add ABI placeholders for the UI
- Create `frontend/src/lib/abi/`.
- Add placeholder ABI files for the four contracts (e.g., JSON files or minimal exports).
- Keep them minimal (e.g., `[]`) so TypeScript/Next doesn't choke on imports.

#### 7) tsconfig for Hardhat scripts/tests
Add or update `hardhat/tsconfig.json` so Hardhat scripts/tests use strict TS + appropriate module/node settings.

#### 8) Install frontend dependencies
- Run: `cd frontend && npm install`.
- Add `nodemon` to `frontend/package.json` devDependencies if it doesn't already exist.
- If you add a dev script wrapper later, keep it compatible with `next dev`.

#### 9) Run verification (end of Step 0)
- `cd frontend && npm run dev` — confirm Next.js starts.
- `cd hardhat && npx hardhat compile` — confirm contracts compile.
- `cd hardhat && npx hardhat test` — expect it not to fully pass yet (will pass after Step 5).

#### 10) Stop per Cursor rules
Stop after Step 0, then wait for approval: `Approved, go Step 1.` or `Fix Step 0: ...`.

---

### Step 1 — Implement `MockUSDT.sol`

**Goal:** Update the Step-0 placeholder in `hardhat/contracts/MockUSDT.sol` to fully support ERC-20 minting for local testing.

**Implementation approach:**

1. Add an `owner` set in the constructor and an `onlyOwner` modifier.
2. Implement `demoMint(address to, uint256 amount)` so it updates `balances[to]` and `totalSupply`, and emits `Transfer(address(0), to, amount)`.
3. Keep existing `transfer`, `transferFrom`, `approve`, `allowance`, and `balanceOf` logic (they already match the intended ERC-20 behavior model used by `LendingPool`).

**Files involved:**
- `hardhat/contracts/MockUSDT.sol`

**Verification:**
- `cd hardhat && npx hardhat compile` — must succeed

---

### Step 2 — Implement `FRToken.sol`
What to do:
1. Implement ERC-20 share token.
2. Mint/burn restricted to `LendingPool`.

Verify:
- compile succeeds

---

### Step 3 — Implement `MockPriceOracle.sol`
What to do:
1. Store ETH price as USDT per 1 ETH using fixed-point precision.
2. Admin-only setter `setPrice(uint256 newPrice)`.
3. Public getter `getPrice()`.

Verify:
- compile succeeds

---

### Step 4 — Implement `LendingPool.sol` (Core Protocol)
What to do:
1. Add state:
   - `collateralETH`, `debtUSDT`, `lastAccrualTimestamp`
   - pool totals used for utilization/APY
2. Implement `_updateBorrowerDebt(borrower)` with the mandatory 4-step normalization.
3. Ensure `_updateBorrowerDebt(...)` is called before:
   - `borrow`, `repay`, `withdrawCollateral`, `liquidate`
4. Implement `getAvailableLiquidity()`:
   - returns `MockUSDT.balanceOf(address(this))`
5. Implement borrowing with real liquidity check:
   - require `borrowAmount <= getAvailableLiquidity()`
6. Implement withdrawals with real liquidity check:
   - require redeem amount <= `getAvailableLiquidity()`
7. Implement:
   - lender: `depositLiquidity`, `withdrawLiquidity`
   - borrower: `depositCollateral` (payable), `borrow`, `repay`, `withdrawCollateral`
   - liquidator: `liquidate(borrower, repayAmount)` when `HF < 1`
8. Implement view functions needed for UI:
   - utilization
   - borrowAPY
   - supplyAPY
   - collateralValue
   - debtValue
   - healthFactor
   - maxBorrow
   - availableLiquidity

Verify:
- compile succeeds

---

### Step 5 — Hardhat Tests for Rules & Edge Cases
What to do:
1. Create `hardhat/test/LendingPool.test.ts`
2. Cover at minimum:
   - FR minting first deposit 1:1
   - borrow blocked above max LTV
   - borrow blocked when exceeding real USDT balance
   - lazy accrual updates debtUSDT only when actions happen
   - withdrawCollateral blocked when HF would fall below 1
   - liquidation blocked when HF >= 1 and allowed when HF < 1
   - liquidation uses 5% bonus and caps seized ETH by available collateral

Verify:
- `cd hardhat && npx hardhat test` passes

---

### Step 6 — PostgreSQL Schema + Admin Auth Storage
What to do:
1. Update `db/schema.sql` to include:
   - `admin_users(username PK, password_hash, salt, created_at)`
2. Add optional tables if needed for logs.

Verify:
- apply schema successfully with psql

---

### Step 7 — Admin Login APIs (Hashing + Salt + Session)
What to do:
1. Add server routes:
   - `POST /api/admin/init` (one-time, guarded by `ADMIN_DB_INIT_SECRET`)
   - `POST /api/admin/login` (username/password verify)
   - `POST /api/admin/logout`
2. Implement session cookie + `requireAdmin()`.

Verify:
- correct credentials -> 200
- wrong credentials -> 401

---

### Step 8 — Admin UI + On-Chain Actions via MetaMask
What to do:
1. Create `frontend/src/app/admin/page.tsx`:
   - username/password login gate
   - after login, allow:
     - set oracle price (`MockPriceOracle.setPrice`)
2. Transaction signing must be done by MetaMask connected wallet.
3. Required: Display the authorized admin wallet address and compare it with the connected MetaMask wallet; show warning/error if they don't match.
4. Ensure the authorized admin wallet is set as the owner/admin of `MockPriceOracle` and `LendingPool` during deployment.

Verify:
- admin page access controlled by login
- on-chain updates work when MetaMask connected as authorized admin wallet

---

### Step 9 — Lender UI: Deposit / Withdraw FR (MetaMask)
What to do:
1. Implement `/pool`:
   - show availableLiquidity via `getAvailableLiquidity()`
   - deposit flow: approve MockUSDT -> `depositLiquidity`
   - withdraw flow: `withdrawLiquidity`
2. Ensure UI reads protocol stats for APY and utilization.

Verify:
- FR increases on deposit
- withdrawals cannot exceed real USDT balance

---

### Step 10 — Borrower UI: Collateral + Borrow + Repay + Withdraw
What to do:
1. Implement borrower position page:
   - show collateralETH, debtUSDT, healthFactor, maxBorrow
2. Actions:
   - depositCollateral (payable)
   - borrow
   - repay
   - withdrawCollateral (HF-safe)

Verify:
- repay updates debt and improves HF
- withdrawCollateral respects HF checks

---

### Step 11 — Liquidator UI: Liquidate When HF < 1
What to do:
1. Implement `/liquidations`:
   - input borrower address
   - display HF and allow liquidate when HF < 1
2. Liquidate flow:
   - approve MockUSDT -> `liquidate(borrower, repayAmount)`

Verify:
- liquidate blocked when HF >= 1
- seized collateral and bonus follow rules

---

### Step 12 — Dashboard (On-Chain + Off-Chain Analytics)
What to do:
1. Implement `/dashboard`
2. Combine:
   - on-chain real-time protocol state
   - off-chain PostgreSQL analytics/history

On-chain data:
- total supplied
- total borrowed
- available liquidity
- utilization
- borrow APY
- supply APY
- reserve balance
- ETH oracle price
- lender FR balance
- lender withdrawable estimate
- borrower collateral
- borrower debt
- borrower max borrow
- borrower health factor
- liquidation eligibility

Off-chain data:
- activity logs
- liquidation records
- APY snapshots
- utilization snapshots
- recent actions
- optional summaries/notes

Dashboard sections:
- Protocol overview
- Lender analysis
- Borrower analysis
- Liquidator analysis
- Historical analytics

Rule:
- on-chain = source of truth
- PostgreSQL = analytics/history/support only

Verify:
- dashboard clearly separates on-chain state from off-chain analytics

---

### Step 13 — Documentation + Packaging
What to do:
1. Update `documentation/README.md` with:
   - prerequisites
   - env vars
   - DB setup
   - deploy/run steps (Hardhat node, Ignition, frontend)
2. Ensure packaging instructions:
   - implementation zip: `frontend/`, `hardhat/`, `db/` without `node_modules`
   - documentation zip: `documentation/`

Verify:
- fresh clone can follow README and run the demo

<!-- PLAN_END: Only use content between PLAN_BEGIN and PLAN_END -->