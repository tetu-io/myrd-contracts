// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IGauge {

  error WaitForNewPeriod();
  error WrongStakingToken(address stakingToken);

  event AddStakingToken(address token);
  event Deposit(address indexed stakingToken, address indexed account, uint amount);
  event Withdraw(address indexed stakingToken, address indexed account, uint amount, bool full);


  function getReward(
    address stakingToken,
    address account,
    address[] memory tokens
  ) external;

  function getAllRewards(
    address stakingToken,
    address account
  ) external;

  function getAllRewardsForTokens(
    address[] memory stakingTokens,
    address account
  ) external;

  function handleBalanceChange(address account) external;

  function notifyRewardAmount(address stakingToken, address token, uint amount) external;

  function addStakingToken(address token) external;

  function getPeriod() external view returns (uint);
}
