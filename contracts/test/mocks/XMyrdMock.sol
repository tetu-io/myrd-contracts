// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../../interfaces/IXMyrd.sol";
import "./MockToken.sol";

contract XMyrdMock is MockToken {
  address myrd;
  address gauge;
  bool private rebaseCalled;
  mapping(address => uint) private _enterForCalled;
  uint private rebaseAmountToTransfer;

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
        uint amount = rebaseAmountToTransfer == 0 ? myrdBalance : rebaseAmountToTransfer;
        IERC20(myrd).transfer(gauge, amount);
      }
    }
  }

  function setRebaseAmountToTransfer_(uint rebaseAmountToTransfer_) external {
    rebaseAmountToTransfer = rebaseAmountToTransfer_;
  }

  function isRebaseCalled() external view returns (bool) {
    return rebaseCalled;
  }

  function enterFor(uint amount_, address receiver) external {
    _enterForCalled[receiver] += amount_;
  }

  function enterForAmount(address receiver) external view returns (uint) {
    return _enterForCalled[receiver];
  }

  function pendingRebase() external view returns (uint) {
    return IERC20(myrd).balanceOf(address(this));
  }

  function BASIS() external pure returns (uint) {
    return 10_000;
  }
}