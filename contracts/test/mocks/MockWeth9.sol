// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockWeth9 is ERC20 {

  uint8 internal _decimals;

  constructor() ERC20("Wrapped Ether Mock", "WETH") {
  }

  receive() external payable {
    _mint(msg.sender, msg.value);
  }

  fallback() external payable {
    _mint(msg.sender, msg.value);
  }

  function deposit() external payable {
    _mint(msg.sender, msg.value);
  }

  function mint(address to, uint amount) external {
    _mint(to, amount);
  }

  function burn(address from, uint amount) external {
    _burn(from, amount);
  }
}
