// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../interfaces/IVesting.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Vesting contract for token distribution
contract Vesting is IVesting, ReentrancyGuard {

  //////////////////////////////

  /// @dev Will start after the cliff
  uint public immutable vestingPeriod;
  /// @dev Delay before the vesting
  uint public immutable cliffPeriod;
  /// @dev Percent of TGE, no decimals
  uint public immutable tgePercent;

  //////////////////////////////

  /// @dev Token for vesting
  IERC20 public token;

  /// @dev Start of vesting
  uint public vestingStartTs;

  /// @dev Claimant => whole amount for distribution
  mapping(address => uint) public toDistribute;
  /// @notice Claimant => [last claimed timestamp, claimed vesting amount]
  /// @dev Use unpackLastVestedData to decode
  mapping(address => bytes32) public lastVestedClaim;
  /// @dev Claimant => TGE claimed indicator
  mapping(address => bool) public tgeClaimed;
  /// @dev if for some reason claimant did not claim all tokens it recorded in this map for make possible to claim it later
  mapping(address => uint) public extraAmounts;

  //////////////////////////////

  event Created(uint vestingPeriod, uint cliffPeriod, uint tgePercent);
  event Started(address token, uint totalAmount, uint time, address[] claimants, uint[] amounts);
  event Claimed(address claimer, uint amount);

  //////////////////////////////

  constructor(uint _vestingPeriod, uint _cliffPeriod, uint _tgePercent) {
    require(_vestingPeriod > 0, "Zero vesting");
    require(_tgePercent < 100, "Too much TGE");

    vestingPeriod = _vestingPeriod;
    cliffPeriod = _cliffPeriod;
    tgePercent = _tgePercent;

    emit Created(_vestingPeriod, _cliffPeriod, _tgePercent);
  }

  //////////////////////////////

  function start(
    bool useTokensOnBalance,
    address _token,
    uint totalAmount,
    address[] calldata claimants,
    uint[] calldata amounts
  ) external override {
    require(vestingStartTs == 0, "Already started");
    require(_token != address(0), "Zero address");
    require(claimants.length == amounts.length, "Wrong input");

    token = IERC20(_token);
    vestingStartTs = block.timestamp + cliffPeriod;

    uint totalForCheck;

    for (uint i; i < claimants.length; ++i) {
      address claimant = claimants[i];
      uint amount = amounts[i];
      require(claimant != address(0), "Zero address");
      require(amount > 0, "Zero amount");

      toDistribute[claimant] = amount;
      totalForCheck += amount;
    }

    require(totalForCheck == totalAmount, "Wrong total amount");

    if (useTokensOnBalance) {
       require(token.balanceOf(address(this)) >= totalAmount, "Not enough tokens");
    } else {
      IERC20(_token).transferFrom(msg.sender, address(this), totalAmount);
    }

    emit Started(_token, totalAmount, block.timestamp, claimants, amounts);
  }


  /// @notice Returns the claimable amount for a given claimant
  /// @param claimant Address of the claimant
  /// @return amount Total amount claimable at current moment
  /// @return _lastVestedClaimTs Timestamp of the last vested claim
  /// @return extraAmount Extra amount that can be claimed (it's included to {amount})
  /// @return amountVestingToClaim The amount of vesting that will be credited as claimed during the next claim call
  /// @return claimedVestingAmount The amount of vesting that is currently considered claimed
  function toClaim(address claimant) public view returns (
    uint amount,
    uint _lastVestedClaimTs,
    uint extraAmount,
    uint amountVestingToClaim,
    uint claimedVestingAmount
  ) {
    uint _vestingStartTs = vestingStartTs;
    (_lastVestedClaimTs, claimedVestingAmount) = unpackLastVestedData(lastVestedClaim[claimant]);
    _lastVestedClaimTs = _lastVestedClaimTs == 0 ? _vestingStartTs : _lastVestedClaimTs;

    if (_lastVestedClaimTs != 0) {
      uint vestingTime = _vestingStartTs + vestingPeriod < block.timestamp ? _vestingStartTs + vestingPeriod : block.timestamp;
      uint timeDiff = _lastVestedClaimTs < vestingTime ? vestingTime - _lastVestedClaimTs : 0;

      uint _toDistribute = toDistribute[claimant];
      uint claimableTGE = _toDistribute * tgePercent / 100;
      uint claimableVesting = _toDistribute - claimableTGE;
      claimableTGE = tgeClaimed[claimant] ? 0 : claimableTGE;

      extraAmount = extraAmounts[claimant];

      // The claimant should claim exactly {_toDistribute} amount in total.
      // Don't allow any losses because of rounding.
      amountVestingToClaim = block.timestamp <= vestingTime
        ? timeDiff * claimableVesting / vestingPeriod
        : claimableVesting > claimedVestingAmount ? claimableVesting - claimedVestingAmount : 0;

      amount = amountVestingToClaim + claimableTGE + extraAmount;

      uint balance = token.balanceOf(address(this));
      amount = balance < amount ? balance : amount;
    } else {
      // not started yet
    }

    return (amount, _lastVestedClaimTs, extraAmount, amountVestingToClaim, claimedVestingAmount);
  }

  function claim() external nonReentrant {
    (uint _toClaim, uint _lastVestedClaimTs, uint extraAmount, uint amountVestingToClaim, uint claimedAmount) = toClaim(msg.sender);

    require(_lastVestedClaimTs != 0, "Not started");
    require(_toClaim != 0, "Nothing to claim");

    // if vesting started need to update last claim timestamp
    if (_lastVestedClaimTs < block.timestamp) {
      lastVestedClaim[msg.sender] = packLastVestedData(uint64(block.timestamp), claimedAmount + amountVestingToClaim);
    }

    // assume that any claim will mark TGE as claimed
    if (!tgeClaimed[msg.sender]) {
      tgeClaimed[msg.sender] = true;
    }

    // if extra amount is not zero need ro reset it
    if (extraAmount != 0) {
      delete extraAmounts[msg.sender];
    }

    uint notClaimed = _transferClaimedTokens(token, _toClaim, msg.sender);

    // if we claimed not all amount need to write extra amount for future claims
    if (notClaimed != 0) {
      extraAmounts[msg.sender] = notClaimed;
    }

    emit Claimed(msg.sender, _toClaim);
  }

  function _transferClaimedTokens(IERC20 _token, uint amount, address claimant) internal virtual returns (uint notClaimed) {
    _token.transfer(claimant, amount);
    // by default all tokens claimed
    return 0;
  }

  function packLastVestedData(uint64 lastVestedClaimTs, uint claimedVestingAmount) internal pure returns (bytes32 data) {
    data = bytes32(uint(lastVestedClaimTs));
    data |= bytes32(uint(uint192(claimedVestingAmount))) << 64;
  }

  function unpackLastVestedData(bytes32 data) public pure returns (uint64 lastVestedClaimTs, uint claimedVestingAmount) {
    lastVestedClaimTs = uint64(uint(data));
    claimedVestingAmount = uint192(uint(data) >> 64);
  }
}
