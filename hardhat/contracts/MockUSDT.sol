// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @notice Step-0 placeholder for the MVP stablecoin.
 * The real demo mint logic is implemented in Step 1.
 */
contract MockUSDT {
    string public name = "MockUSDT";
    string public symbol = "USDT";
    uint8 public decimals = 18;

    uint256 public totalSupply;

    address public owner;

    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) private allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
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
     * @notice Demo mint restricted mint for testing.
     * Restricted to the contract owner (deployer).
     */
    function demoMint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "ZERO_TO");
        require(amount > 0, "ZERO_AMOUNT");

        balances[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
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

