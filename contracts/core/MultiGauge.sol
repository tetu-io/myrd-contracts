// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./StakelessMultiPoolBase.sol";
import "../interfaces/IGauge.sol";
import "../interfaces/IXMyrd.sol";
import "../interfaces/IAppErrors.sol";
import "../proxy/Controllable.sol";

/// @title Stakeless pool for single staking token (xMyrd)
contract MultiGauge is StakelessMultiPoolBase, IGauge {

  //region ---------------------- Constants

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VERSION = "1.0.0";

  // keccak256(abi.encode(uint256(keccak256("erc7201:myrd.MultiGauge")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant MULTI_GAUGE_STORAGE_LOCATION = 0x56fe937432a4b636174f357965a052660eeb836d7a87be456fd784604b733000; // erc7201:myrd.MultiGauge

  uint public constant REWARDS_PERIOD = 7 days;
  //endregion ---------------------- Constants

  //region ---------------------- Data types
  /// @custom:storage-location erc7201:myrd.MultiGauge
  struct MainStorage {
    /// @notice XMyrd - the sole staking token
    address xMyrd;

    /// @notice Current active period (a week number)
    uint activePeriod;
  }

  //endregion ---------------------- Data types

  //region ---------------------- Init

  /// @param xMyrd_ is sole staking token
  /// @param myrd_ is default reward token
  function init(address controller_, address xMyrd_, address myrd_) external initializer {
    __MultiPool_init(controller_, myrd_, REWARDS_PERIOD);

    if(xMyrd_ == address(0)) revert IAppErrors.ZeroAddress();
    _S().xMyrd = xMyrd_;
  }
  //endregion ---------------------- Init

  //region ---------------------- Operator actions
  /// @notice Allowed contracts can whitelist token. Removing is forbidden.
  /// @dev Only one staking token (xMyrd) is allowed in the current implementation, it's already set in the constructor
  function addStakingToken(address) external pure /* onlyAllowedContracts */ {
    revert IAppErrors.AlreadySet();
  }

  /// @notice Update active period. Can be called only once per week. Call IXMyrd.rebase()
  /// @param amount_ Amount of MYRD-rewards for next period = amount_ + penalty received from xMyrd
  function updatePeriod(uint amount_) external {
    // no restrictions for msg.sender - anybody can call this function

    MainStorage storage $ = _S();
    uint _activePeriod = getPeriod();
    if ($.activePeriod >= _activePeriod) revert WaitForNewPeriod();

    $.activePeriod = _activePeriod;

    address _xMyrd = $.xMyrd;
    // get MYRD balance before calling rebase()
    address _myrd = defaultRewardToken;
    uint balanceBefore = IERC20(_myrd).balanceOf(address(this));

    // receive penalties from xMyrd (if any)
    // xMyrd will transfer penalties directly to this contract
    IXMyrd(_xMyrd).rebase();

    // notify reward amount if necessary
    uint balanceAfter = IERC20(_myrd).balanceOf(address(this));
    if (
      balanceAfter > balanceBefore // penalties received
      || amount_ != 0 // additional amount provided
    ) {
      // received penalties will be added to the amount_ inside _notifyRewardAmount
      _notifyRewardAmount(_S().xMyrd, _myrd, amount_, true, balanceBefore);
    }
  }
  //endregion ---------------------- Operator actions

  //region ---------------------- Claim

  function getReward(address account, address[] memory tokens) external {
    _getReward(_S().xMyrd, account, tokens, account);
  }

  function getAllRewards(address account) external {
    address stakingToken = _S().xMyrd;
    address[] storage rts = rewardTokens[stakingToken];
    uint length = rts.length;
    address[] memory tokens = new address[](length + 1);
    for (uint i; i < length; ++i) {
      tokens[i] = rts[i];
    }
    tokens[length] = defaultRewardToken;
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
  function notifyRewardAmount(address token, uint amount) external nonReentrant {
    // default reward token is MYRD
    // it's processed in special way through updatePeriod only
    // because amount of rewards is combined from penalties and provided additional amount
    if (token == defaultRewardToken) revert IAppErrors.ShouldUseUpdatePeriod();

    uint balanceBefore = IERC20(token).balanceOf(address(this));
    _notifyRewardAmount(_S().xMyrd, token, amount, true, balanceBefore);
  }
  //endregion ---------------------- Actions

  //region ---------------------- Views

  function getPeriod() public view returns (uint) {
    return (block.timestamp / REWARDS_PERIOD);
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
