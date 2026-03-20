// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IFRTokenLike {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

interface IPriceOracleLike {
    function getPrice() external view returns (uint256);
}

contract LendingPool {
    // ─── Existing state (keep) ───────────────────────────────────────────
    IERC20Like public usdt;
    IPriceOracleLike public oracle;
    IFRTokenLike public frToken;

    mapping(address => uint256) public collateralETH;
    mapping(address => uint256) public debtUSDT;
    mapping(address => uint256) public lastAccrualTimestamp;

    uint256 public totalBorrowedUSDT;
    uint256 public totalReservesUSDT;

    // ─── New state ────────────────────────────────────────────────────────
    /// @notice Remaining lender principal accounting base.
    /// Increases by amount on deposit; decreases by principalRedeemed on withdrawal.
    /// Does not include earned interest — poolValue represents full lender claim value.
    uint256 public totalSuppliedUSDT;

    // BPS constants (section 7.2)
    uint256 private constant MAX_LTV_BPS               = 7000;
    uint256 private constant LIQUIDATION_THRESHOLD_BPS  = 8000;
    uint256 private constant LIQUIDATION_BONUS_BPS      = 500;
    uint256 private constant RESERVE_FACTOR_BPS         = 1000;
    uint256 private constant BASE_BORROW_APY_BPS        = 200;
    uint256 private constant OPTIMAL_UTIL_BPS            = 8000;
    uint256 private constant SLOPE1_BPS                  = 1000;
    uint256 private constant SLOPE2_BPS                  = 4000;

    // ─── Constructor ──────────────────────────────────────────────────────
    constructor(address usdt_, address oracle_, address frToken_) {
        require(usdt_ != address(0), "ZERO_USDT");
        require(oracle_ != address(0), "ZERO_ORACLE");
        require(frToken_ != address(0), "ZERO_FRTOKEN");
        usdt    = IERC20Like(usdt_);
        oracle  = IPriceOracleLike(oracle_);
        frToken = IFRTokenLike(frToken_);
    }

    // ─── Helper Functions ─────────────────────────────────────────────────

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    function _getUtilizationBps() private view returns (uint256) {
        if (totalSuppliedUSDT == 0) return 0;
        return totalBorrowedUSDT * 10000 / totalSuppliedUSDT;
    }

    function _computeBorrowAPY(uint256 utilBps) private pure returns (uint256) {
        if (utilBps <= OPTIMAL_UTIL_BPS) {
            return BASE_BORROW_APY_BPS + utilBps * SLOPE1_BPS / OPTIMAL_UTIL_BPS;
        } else {
            uint256 excess = utilBps - OPTIMAL_UTIL_BPS;
            return BASE_BORROW_APY_BPS + SLOPE1_BPS
                + excess * SLOPE2_BPS / (10000 - OPTIMAL_UTIL_BPS);
        }
    }

    function _poolValue() private view returns (uint256) {
        return usdt.balanceOf(address(this)) + totalBorrowedUSDT - totalReservesUSDT;
    }

    /// @dev Read-only mirror of _updateBorrowerDebt. No storage writes.
    function _virtualDebt(address borrower) private view returns (uint256) {
        uint256 oldDebt = debtUSDT[borrower];
        if (lastAccrualTimestamp[borrower] == 0) return 0;
        uint256 elapsed = block.timestamp - lastAccrualTimestamp[borrower];
        if (elapsed == 0 || oldDebt == 0) return oldDebt;
        uint256 utilBps = _getUtilizationBps();
        uint256 apyBps  = _computeBorrowAPY(utilBps);
        uint256 accrued = oldDebt * apyBps * elapsed / (365 days * 10000);
        return oldDebt + accrued;
    }

    function _getCollateralValue(address borrower) private view returns (uint256) {
        return collateralETH[borrower] * oracle.getPrice() / 1e18;
    }

    function _getDebtValue(address borrower) private view returns (uint256) {
        return _virtualDebt(borrower);
    }

    function _getMaxBorrow(address borrower) private view returns (uint256) {
        uint256 maxRaw = _getCollateralValue(borrower) * MAX_LTV_BPS / 10000;
        uint256 currentDebt = _getDebtValue(borrower);
        if (maxRaw <= currentDebt) return 0;
        return maxRaw - currentDebt;
    }

    function _getHealthFactorFromValues(
        uint256 collateralEthAmount,
        uint256 debtAmount
    ) private view returns (uint256) {
        if (debtAmount == 0) return type(uint256).max;
        uint256 collateralVal = collateralEthAmount * oracle.getPrice() / 1e18;
        return collateralVal * LIQUIDATION_THRESHOLD_BPS * 1e18 / (debtAmount * 10000);
    }

    function _getHealthFactor(address borrower) private view returns (uint256) {
        return _getHealthFactorFromValues(collateralETH[borrower], _getDebtValue(borrower));
    }

    // ─── Lazy Debt Normalization (12 steps, section 7.12) ────────────────
    function _updateBorrowerDebt(address borrower) internal {
        uint256 oldDebt = debtUSDT[borrower];

        if (lastAccrualTimestamp[borrower] == 0) {
            lastAccrualTimestamp[borrower] = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - lastAccrualTimestamp[borrower];
        if (elapsed == 0 || oldDebt == 0) {
            lastAccrualTimestamp[borrower] = block.timestamp;
            return;
        }

        uint256 utilBps = _getUtilizationBps();
        uint256 apyBps = _computeBorrowAPY(utilBps);
        uint256 accrued = oldDebt * apyBps * elapsed / (365 days * 10000);

        if (accrued == 0) {
            lastAccrualTimestamp[borrower] = block.timestamp;
            return;
        }

        uint256 reservePortion = accrued * RESERVE_FACTOR_BPS / 10000;

        debtUSDT[borrower] = oldDebt + accrued;
        totalBorrowedUSDT += accrued;
        totalReservesUSDT += reservePortion;
        lastAccrualTimestamp[borrower] = block.timestamp;
    }

    // ─── Action Functions ─────────────────────────────────────────────────

    function depositLiquidity(uint256 amount) external {
        require(amount > 0, "ZERO_AMOUNT");

        // Snapshot pool state BEFORE the new deposit is in scope (section 7.13.1)
        uint256 poolValueBefore = _poolValue();
        uint256 frSupplyNow = frToken.totalSupply();

        uint256 sharesMinted;
        if (frSupplyNow == 0) {
            sharesMinted = amount; // 1:1 first deposit
        } else {
            require(poolValueBefore > 0, "ZERO_POOL_VALUE");
            sharesMinted = amount * frSupplyNow / poolValueBefore;
        }

        // Transfer USDT from lender to pool
        require(usdt.transferFrom(msg.sender, address(this), amount), "TRANSFER_FAILED");

        frToken.mint(msg.sender, sharesMinted);
        totalSuppliedUSDT += amount;
    }

    function withdrawLiquidity(uint256 frAmount) external {
        require(frAmount > 0, "ZERO_AMOUNT");

        uint256 frSupplyNow = frToken.totalSupply();
        require(frSupplyNow > 0, "NO_SHARES");

        uint256 poolVal   = _poolValue();
        uint256 redeemAmt = frAmount * poolVal / frSupplyNow;

        require(redeemAmt <= usdt.balanceOf(address(this)), "INSUFFICIENT_LIQUIDITY");

        frToken.burn(msg.sender, frAmount);

        // Subtract only the principal portion (not earnings), so totalSuppliedUSDT never underflows
        uint256 principalRedeemed = frAmount * totalSuppliedUSDT / frSupplyNow;
        totalSuppliedUSDT -= principalRedeemed;

        require(usdt.transfer(msg.sender, redeemAmt), "TRANSFER_FAILED");
    }

    function depositCollateral() external payable {
        require(msg.value > 0, "ZERO_COLLATERAL");
        collateralETH[msg.sender] += msg.value;
    }

    function borrow(uint256 borrowAmount) external {
        require(borrowAmount > 0, "ZERO_BORROW");
        require(oracle.getPrice() > 0, "PRICE_NOT_SET");

        _updateBorrowerDebt(msg.sender);

        require(collateralETH[msg.sender] > 0, "NO_COLLATERAL");

        // Use normalized storage debt directly (no virtual-debt call needed)
        uint256 currentDebt = debtUSDT[msg.sender];
        uint256 maxRawBorrow = _getCollateralValue(msg.sender) * MAX_LTV_BPS / 10000;
        uint256 newDebt = currentDebt + borrowAmount;

        require(newDebt <= maxRawBorrow, "MAX_BORROW_EXCEEDED");
        require(borrowAmount <= usdt.balanceOf(address(this)), "INSUFFICIENT_LIQUIDITY");

        require(usdt.transfer(msg.sender, borrowAmount), "TRANSFER_FAILED");

        debtUSDT[msg.sender] = newDebt;
        totalBorrowedUSDT += borrowAmount;
    }

    function repay(uint256 repayAmount) external {
        require(repayAmount > 0, "ZERO_REPAY");

        _updateBorrowerDebt(msg.sender);

        uint256 reduction = _min(repayAmount, debtUSDT[msg.sender]);
        require(reduction > 0, "NOTHING_TO_REPAY");

        require(usdt.transferFrom(msg.sender, address(this), reduction), "TRANSFER_FAILED");

        debtUSDT[msg.sender] -= reduction;
        totalBorrowedUSDT -= reduction;
    }

    function withdrawCollateral(uint256 ethAmount) external {
        require(ethAmount > 0, "ZERO_AMOUNT");
        require(ethAmount <= collateralETH[msg.sender], "INSUFFICIENT_COLLATERAL");

        _updateBorrowerDebt(msg.sender);

        uint256 postCollateral = collateralETH[msg.sender] - ethAmount;
        uint256 currentDebt = debtUSDT[msg.sender]; // normalized storage debt directly

        require(
            _getHealthFactorFromValues(postCollateral, currentDebt) >= 1e18,
            "HF_BELOW_ONE"
        );

        collateralETH[msg.sender] = postCollateral;
        (bool sent, ) = msg.sender.call{value: ethAmount}("");
        require(sent, "ETH_TRANSFER_FAILED");
    }

    function liquidate(address borrower, uint256 repayAmount) external {
        require(repayAmount > 0, "ZERO_REPAY");

        uint256 ethPrice = oracle.getPrice();
        require(ethPrice > 0, "PRICE_NOT_SET");

        _updateBorrowerDebt(borrower);

        require(
            _getHealthFactorFromValues(collateralETH[borrower], debtUSDT[borrower]) < 1e18,
            "HF_ABOVE_ONE"
        );

        uint256 repayActual = _min(repayAmount, debtUSDT[borrower]);
        require(repayActual > 0, "NOTHING_TO_LIQUIDATE");

        uint256 collateralSeized = repayActual
            * (10000 + LIQUIDATION_BONUS_BPS)
            * 1e18
            / (10000 * ethPrice);
        uint256 collateralSeizedActual = _min(collateralSeized, collateralETH[borrower]);

        // Transfer USDT from liquidator to pool
        require(usdt.transferFrom(msg.sender, address(this), repayActual), "TRANSFER_FAILED");

        debtUSDT[borrower] -= repayActual;
        totalBorrowedUSDT -= repayActual;
        collateralETH[borrower] -= collateralSeizedActual;

        // Transfer seized ETH to liquidator
        (bool sent, ) = msg.sender.call{value: collateralSeizedActual}("");
        require(sent, "ETH_TRANSFER_FAILED");
    }

    // ─── Public View Functions ────────────────────────────────────────────

    function getAvailableLiquidity() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    function getUtilization() external view returns (uint256) {
        return _getUtilizationBps();
    }

    function getBorrowAPY() external view returns (uint256) {
        return _computeBorrowAPY(_getUtilizationBps());
    }

    function getSupplyAPY() external view returns (uint256) {
        uint256 utilBps = _getUtilizationBps();
        uint256 borrowApyBps = _computeBorrowAPY(utilBps);
        return borrowApyBps * utilBps * (10000 - RESERVE_FACTOR_BPS) / 10000 / 10000;
    }

    function getCollateralValue(address borrower) external view returns (uint256) {
        return _getCollateralValue(borrower);
    }

    function getDebtValue(address borrower) external view returns (uint256) {
        return _getDebtValue(borrower);
    }

    function getHealthFactor(address borrower) public view returns (uint256) {
        return _getHealthFactor(borrower);
    }

    function getMaxBorrow(address borrower) external view returns (uint256) {
        return _getMaxBorrow(borrower);
    }

    function getPoolValue() external view returns (uint256) {
        return _poolValue();
    }

    function getTotalSupplied() external view returns (uint256) {
        return totalSuppliedUSDT;
    }

    // ─── Fallback to receive ETH ─────────────────────────────────────────
    receive() external payable {}
}
