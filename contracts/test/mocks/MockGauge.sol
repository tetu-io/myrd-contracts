// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../../interfaces/IGauge.sol";

contract MockGauge is IGauge {
  mapping(address => mapping(address => uint)) private _rewards;
  mapping(address => uint) private _allRewards;
  mapping(address => uint) private _periods;
  mapping(address => bool) private _stakingTokens;
  mapping(address => mapping(address => mapping(uint => bool))) private _notifyRewardAmountCalls;
  mapping(address => bool) private _handleBalanceChangeCalls;


  function setReward(address account, address token, uint amount) external {
    _rewards[account][token] = amount;
  }

  function getReward(address account, address[] memory tokens) external view override {
    for (uint i = 0; i < tokens.length; i++) {
      _rewards[account][tokens[i]];
    }
  }

  function setAllRewards(address account, uint amount) external {
    _allRewards[account] = amount;
  }

  function getAllRewards(address account) external view override {
    _allRewards[account];
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
}