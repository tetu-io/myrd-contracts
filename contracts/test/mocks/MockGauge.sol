// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../../interfaces/IGauge.sol";

contract MockGauge is IGauge {
  mapping(address => mapping(address => mapping(address => uint))) private _rewards;
  mapping(address => mapping(address => uint)) private _allRewards;
  mapping(address => uint) private _periods;
  mapping(address => bool) private _stakingTokens;
  mapping(address => mapping(address => mapping(uint => bool))) private _notifyRewardAmountCalls;
  mapping(address => bool) private _handleBalanceChangeCalls;


  function setReward(
    address stakingToken,
    address account,
    address token,
    uint amount
  ) external {
    _rewards[stakingToken][account][token] = amount;
  }

  function getReward(
    address stakingToken,
    address account,
    address[] memory tokens
  ) external override {
    for (uint i = 0; i < tokens.length; i++) {
      // Simulate reward logic
      _rewards[stakingToken][account][tokens[i]];
    }
  }

  function setAllRewards(
    address stakingToken,
    address account,
    uint amount
  ) external {
    _allRewards[stakingToken][account] = amount;
  }

  function getAllRewards(
    address stakingToken,
    address account
  ) external override {
    _allRewards[stakingToken][account];
  }

  function setPeriod(address stakingToken, uint period) external {
    _periods[stakingToken] = period;
  }

  function getPeriod() external view override returns (uint) {
    return _periods[msg.sender];
  }

  function addStakingToken(address token) external override {
    _stakingTokens[token] = true;
  }

  function notifyRewardAmount(
    address stakingToken,
    address token,
    uint amount
  ) external override {
    _notifyRewardAmountCalls[stakingToken][token][amount] = true;
  }

  function handleBalanceChange(address account) external override {
    _handleBalanceChangeCalls[account] = true;
  }

  function isNotifyRewardAmountCalled(
    address stakingToken,
    address token,
    uint amount
  ) external view returns (bool) {
    return _notifyRewardAmountCalls[stakingToken][token][amount];
  }

  function isHandleBalanceChangeCalled(address account) external view returns (bool) {
    return _handleBalanceChangeCalls[account];
  }

  function getAllRewardsForTokens(
    address[] memory stakingTokens,
    address account
  ) external override {
    for (uint i = 0; i < stakingTokens.length; i++) {
      _allRewards[stakingTokens[i]][account];
    }
  }
}