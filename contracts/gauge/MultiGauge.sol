// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../interfaces/IGauge.sol";
import "../proxy/Controllable.sol";
import "./StakelessMultiPoolBase.sol";
import {IXMyrd} from "../interfaces/IXMyrd.sol";
import {IAppErrors} from "../interfaces/IAppErrors.sol";

/// @title Stakeless pool for xMyrd
/// @author belbix
contract MultiGauge is StakelessMultiPoolBase, IGauge {

  //region ---------------------- Constants

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VERSION = "1.0.0";
  bytes32 private constant MULTI_GAUGE_STORAGE_LOCATION = 0x0; // todo myrd.MultiGauge
  //endregion ---------------------- Constants

  //region ---------------------- Data types
  /// @custom:storage-location erc7201:myrd.MultiGauge
  struct MainStorage {
    address xMyrd;
    uint activePeriod;
  }

  //endregion ---------------------- Data types

  //region ---------------------- Init

  function init(
    address controller_,
    address xMyrd_,
    address _defaultRewardToken
  ) external initializer {
    __MultiPool_init(controller_, _defaultRewardToken, 7 days);
    _S().xMyrd = xMyrd_;
  }
  //endregion ---------------------- Init

  //region ---------------------- Operator actions
  /// @notice Allowed contracts can whitelist token. Removing is forbidden.
  /// @dev Only one staking token (xMyrd) is allowed
  function addStakingToken(address token) external onlyAllowedContracts {
    if (token != address(0)) {
      if (_S().xMyrd != address(0)) revert IAppErrors.AlreadySet();
      _S().xMyrd = token;
    }
    emit AddStakingToken(token);
  }
  /// @notice Update active period. Can be called only once per week. Call IXMyrd.rebase()
  function updatePeriod() external returns (uint newPeriod) {
    MainStorage storage $ = _S();
    uint _activePeriod = getPeriod();
    if ($.activePeriod >= _activePeriod) revert WaitForNewPeriod();
    $.activePeriod = _activePeriod;

    newPeriod = _activePeriod;
    address _xMyrd = $.xMyrd;
    if (_xMyrd != address(0)) {
      IXMyrd(_xMyrd).rebase();
    }
  }
  //endregion ---------------------- Operator actions

  //region ---------------------- Claim

  function getReward(
    address stakingToken,
    address account,
    address[] memory tokens
  ) external {
    _getReward(stakingToken, account, tokens);
  }

  function getAllRewards(
    address stakingToken,
    address account
  ) external {
    _getAllRewards(stakingToken, account);
  }

  function _getAllRewards(
    address stakingToken,
    address account
  ) internal {
    address[] storage rts = rewardTokens[stakingToken];
    uint length = rts.length;
    address[] memory tokens = new address[](length + 1);
    for (uint i; i < length; ++i) {
      tokens[i] = rts[i];
    }
    tokens[length] = defaultRewardToken;
    _getReward(stakingToken, account, tokens);
  }

  function getAllRewardsForTokens(
    address[] memory _stakingTokens,
    address account
  ) external {
    for (uint i; i < _stakingTokens.length; i++) {
      _getAllRewards(_stakingTokens[i], account);
    }
  }

  function _getReward(address stakingToken, address account, address[] memory tokens) internal {
    _getReward(stakingToken, account, tokens, account);
  }
  //endregion ---------------------- Claim

  //region ---------------------- Virtual deposit/withdraw

  /// @dev Must be called from stakingToken when user balance changed.
  function handleBalanceChange(address account) external {
    address stakingToken = msg.sender;
    if (!isStakeToken(stakingToken)) revert WrongStakingToken(stakingToken);

    uint stakedBalance = balanceOf[stakingToken][account];
    uint actualBalance = IERC20(stakingToken).balanceOf(account);
    if (stakedBalance < actualBalance) {
      _deposit(stakingToken, account, actualBalance - stakedBalance);
    } else if (stakedBalance > actualBalance) {
      _withdraw(stakingToken, account, stakedBalance - actualBalance, actualBalance == 0);
    }
  }

  function _deposit(address stakingToken, address account, uint amount) internal {
    _registerBalanceIncreasing(stakingToken, account, amount);
    emit Deposit(stakingToken, account, amount);
  }

  function _withdraw(address stakingToken, address account, uint amount, bool fullWithdraw) internal {
    _registerBalanceDecreasing(stakingToken, account, amount);
    emit Withdraw(stakingToken, account, amount, fullWithdraw);
  }
  //endregion ---------------------- Virtual deposit/withdraw

  //region ---------------------- Logic override
  function isStakeToken(address token) public view override returns (bool) {
    return _S().xMyrd == token;
  }
  //endregion ---------------------- Logic override

  //region ---------------------- Actions
  function notifyRewardAmount(address stakingToken, address token, uint amount) external nonReentrant {
    _notifyRewardAmount(stakingToken, token, amount, true);
  }
  //endregion ---------------------- Actions

  //region ---------------------- Views

  function getPeriod() public view returns (uint) {
    return (block.timestamp / 1 weeks);
  }

  function activePeriod() external view returns (uint) {
    return _S().activePeriod;
  }

  function xMyrd() external view returns (address) {
    return _S().xMyrd;
  }

  //endregion ---------------------- Views

  //region ---------------------- Internal logic
  function _S() internal pure returns (MainStorage storage $) {
    //slither-disable-next-line assembly
    assembly {
      $.slot := MULTI_GAUGE_STORAGE_LOCATION
    }
    return $;
  }
  //endregion ------------------------ Internal logic
}
