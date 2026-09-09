// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Token di protocollo Zecca. Solo gli address con MINTER_ROLE chiamano mint(to, amount).
/// Non è USDT Tether né USDC Circle: in MetaMask va aggiunto questo contratto.
contract ZeccaMinter {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterUpdated(address indexed minter, bool allowed);

    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    address public admin;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public minters;

    constructor(string memory tokenName, string memory tokenSymbol, uint8 tokenDecimals, address minter) {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
        admin = msg.sender;
        minters[minter] = true;
        emit MinterUpdated(minter, true);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "NOT_ADMIN");
        _;
    }

    function setMinter(address minter, bool allowed) external onlyAdmin {
        minters[minter] = allowed;
        emit MinterUpdated(minter, allowed);
    }

    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "NOT_MINTER");
        require(to != address(0), "ZERO");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "ALLOWANCE");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(to != address(0), "ZERO");
        require(balanceOf[from] >= amount, "BALANCE");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
