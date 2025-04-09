// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {

  uint8 internal _decimals;

  constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
  }

  function mint(address to, uint amount) external {
    _mint(to, amount);
  }

  function burn(address from, uint amount) external {
    _burn(from, amount);
  }

  function burn(uint amount) external {
    _burn(msg.sender, amount);
  }

}
