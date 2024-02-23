// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

interface IVesting {

  function start(
    bool useTokensOnBalance,
    address _token,
    uint totalAmount,
    address[] calldata claimants,
    uint[] calldata amounts
  ) external;

}
