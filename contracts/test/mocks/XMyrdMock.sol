// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../../interfaces/IXMyrd.sol";
import "./MockToken.sol";

contract XMyrdMock is MockToken {
  bool private rebaseCalled;

  constructor(string memory name_, string memory symbol_) MockToken(name_, symbol_) {}

  function rebase() external {
    rebaseCalled = true;
  }

  function isRebaseCalled() external view returns (bool) {
    return rebaseCalled;
  }
}