// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Step-0 placeholder for the FR pool share token.
 * Real mint/burn restrictions and accounting logic are implemented in Step 2.
 */
contract FRToken {
    string public name = "FRToken";
    string public symbol = "FR";
    uint8 public decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) private allowances;

    address public owner;
    address public lendingPool;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier onlyLendingPool() {
        require(msg.sender == lendingPool, "NOT_LENDING_POOL");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function allowance(address owner_, address spender) external view returns (uint256) {
        return allowances[owner_][spender];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowances[from][msg.sender];
        require(currentAllowance >= amount, "ALLOWANCE");
        allowances[from][msg.sender] = currentAllowance - amount;
        _transfer(from, to, amount);
        return true;
    }

    /**
     * @notice Step-0 placeholder setter. Real restrictions are refined in Step 2.
     */
    function setLendingPool(address pool) external onlyOwner {
        lendingPool = pool;
    }

    function mint(address to, uint256 amount) external onlyLendingPool {
        balances[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external onlyLendingPool {
        uint256 fromBal = balances[from];
        require(fromBal >= amount, "BALANCE");
        balances[from] = fromBal - amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "ZERO_TO");
        uint256 fromBal = balances[from];
        require(fromBal >= amount, "BALANCE");

        balances[from] = fromBal - amount;
        balances[to] += amount;
        emit Transfer(from, to, amount);
    }
}

