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
}

interface IPriceOracleLike {
    function getPrice() external view returns (uint256);
}

/**
 * @notice Step-0 placeholder for the lending pool.
 * Core protocol rules are implemented in Step 4.
 */
contract LendingPool {
    IERC20Like public usdt;
    IPriceOracleLike public oracle;
    IFRTokenLike public frToken;

    mapping(address => uint256) public collateralETH;
    mapping(address => uint256) public debtUSDT;
    mapping(address => uint256) public lastAccrualTimestamp;

    uint256 public totalBorrowedUSDT;
    uint256 public totalReservesUSDT;

    constructor(address usdt_, address oracle_, address frToken_) {
        usdt = IERC20Like(usdt_);
        oracle = IPriceOracleLike(oracle_);
        frToken = IFRTokenLike(frToken_);
    }

    function _updateBorrowerDebt(address borrower) internal virtual {
        // Placeholder: just ensure the timestamp is initialized.
        if (lastAccrualTimestamp[borrower] == 0) {
            lastAccrualTimestamp[borrower] = block.timestamp;
        }
    }

    function getAvailableLiquidity() public view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    // ---- Lender actions (placeholders) ----
    function depositLiquidity(uint256 amount) external {
        amount;
        revert("NOT_IMPLEMENTED");
    }

    function withdrawLiquidity(uint256 frAmount) external {
        frAmount;
        revert("NOT_IMPLEMENTED");
    }

    // ---- Borrower actions (placeholders) ----
    function depositCollateral() external payable {
        msg.value;
        revert("NOT_IMPLEMENTED");
    }

    function borrow(uint256 borrowAmount) external {
        borrowAmount;
        revert("NOT_IMPLEMENTED");
    }

    function repay(uint256 repayAmount) external {
        repayAmount;
        revert("NOT_IMPLEMENTED");
    }

    function withdrawCollateral(uint256 collateralAmount) external {
        collateralAmount;
        revert("NOT_IMPLEMENTED");
    }

    // ---- Liquidation actions (placeholders) ----
    function liquidate(address borrower, uint256 repayAmount) external {
        borrower;
        repayAmount;
        revert("NOT_IMPLEMENTED");
    }

    // ---- View functions needed for UI (placeholders) ----
    function utilization() external view returns (uint256) {
        return 0;
    }

    function borrowAPY() external view returns (uint256) {
        return 0;
    }

    function supplyAPY() external view returns (uint256) {
        return 0;
    }

    function collateralValue(address borrower) external view returns (uint256) {
        borrower;
        return 0;
    }

    function debtValue(address borrower) external view returns (uint256) {
        borrower;
        return 0;
    }

    function healthFactor(address borrower) public view returns (uint256) {
        borrower;
        return 0;
    }

    function maxBorrow(address borrower) external view returns (uint256) {
        borrower;
        return 0;
    }

    function availableLiquidity() external view returns (uint256) {
        return getAvailableLiquidity();
    }
}

