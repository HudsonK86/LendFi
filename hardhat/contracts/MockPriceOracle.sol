// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Step-0 placeholder ETH price oracle (admin-settable).
 * Real fixed-point precision rules are implemented in Step 3.
 */
contract MockPriceOracle {
    uint256 public price; // USDT per 1 ETH (placeholder precision)
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    function setPrice(uint256 newPrice) external onlyOwner {
        price = newPrice;
    }

    function getPrice() external view returns (uint256) {
        return price;
    }
}

