// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract MYRD is ERC20Permit,ERC20Burnable {

  uint public constant MAX_SUPPLY = 100_000_000e18;

  address public immutable minter;

  constructor() ERC20("Myrd Token", "MYRD") ERC20Permit("Myrd Token") {
    minter = _msgSender();
  }

  function mint(address to, uint256 amount) external {
    require(_msgSender() == minter, "minter");
    _mint(to, amount);
    require(totalSupply() <= MAX_SUPPLY, "max supply");
  }

}
