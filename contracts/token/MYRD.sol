// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MYRD is ERC20Permit {

  constructor() ERC20("Myrd Token", "MYRD") ERC20Permit("Myrd Token") {
    _mint(msg.sender, 100_000_000e18);
  }

}
