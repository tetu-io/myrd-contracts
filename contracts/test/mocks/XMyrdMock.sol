// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../../interfaces/IXMyrd.sol";
import "./MockToken.sol";

contract XMyrdMock is MockToken {
  address myrd;
  address gauge;
  bool private rebaseCalled;

  constructor(address myrd_, address gauge_) MockToken("x", "y") {
    myrd = myrd_;
    gauge = gauge_;
  }

  /// @dev Transfer all MYRD balance to the gauge
  function rebase() external {
    rebaseCalled = true;
    if (myrd != address(0) && gauge != address(0)) {
      uint256 myrdBalance = IERC20(myrd).balanceOf(address(this));

      if (myrdBalance != 0) {
        IERC20(myrd).transfer(gauge, myrdBalance);
      }
    }
  }

  function isRebaseCalled() external view returns (bool) {
    return rebaseCalled;
  }
}