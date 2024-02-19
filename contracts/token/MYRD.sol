// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MYRD is ERC20Permit {

  constructor(

  ) ERC20("Myrd Token", "MYRD") ERC20Permit("Myrd Token") {

  // todo


    // Treasury 35%
    // Tetu 20%
    // Ambassadors 4%
    // Initial Liquidity 1%
    // Fundraise (Seed) 10%
    // Fundraise (Private) 10%
    // Team 20%

  }

}
