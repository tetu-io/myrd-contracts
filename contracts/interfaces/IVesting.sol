// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IVesting {

  function vestingPeriod() external view returns (uint);
  function cliffPeriod() external view returns (uint);
  function tgePercent() external view returns (uint);

  function start(
    bool useTokensOnBalance,
    address _token,
    uint totalAmount,
    address[] calldata claimants,
    uint[] calldata amounts
  ) external;

}
