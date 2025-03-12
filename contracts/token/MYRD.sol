// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ConstantsLib} from "./ConstantsLib.sol";

contract MYRD is ERC20Permit,ERC20Burnable {

  address public immutable minter;

  constructor() ERC20("Myrd Token", "MYRD") ERC20Permit("Myrd Token") {
    minter = _msgSender();
  }

  function mint(address to, uint256 amount) external {
    require(_msgSender() == minter, "minter");
    _mint(to, amount);
    require(totalSupply() <= ConstantsLib.MAX_SUPPLY, "max supply");
  }

}
