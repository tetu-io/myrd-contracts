// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../interfaces/IVeNFT.sol";
import "../interfaces/IVeDistributor.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Contract for distributing rewards to veNFT holders.
///        Simplified and based on internal epochs.
///        Pay all rewards at once for individual user.
///        No need to wait any epoch delays.
/// @author belbix
contract VeDistributor is IVeDistributor{

  struct EpochInfo {
    uint ts;
    uint rewardsPerToken;
    uint tokenBalance;
    uint veTotalSupply;
  }

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VERSION = "2.0.0";
  uint internal constant WEEK = 7 days;

  // *************************************************************
  //                        VARIABLES
  // *************************************************************

  /// @dev Voting escrow token address
  IVeNFT public immutable ve;
  /// @dev Token for ve rewards
  address public immutable rewardToken;

  // --- CHECKPOINT INFO

  uint public epoch;
  /// @dev epoch => EpochInfo
  mapping(uint => EpochInfo) public epochInfos;

  uint public tokensClaimedSinceLastSnapshot;

  // --- USER INFO

  /// @dev tokenId => paid epoch
  mapping(uint => uint) public lastPaidEpoch;

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event Checkpoint(
    uint epoch,
    uint newEpochTs,
    uint tokenBalance,
    uint prevTokenBalance,
    uint tokenDiff,
    uint rewardsPerToken,
    uint veTotalSupply
  );
  event RewardsClaimed(uint tokenId, address owner, uint amount);

  // *************************************************************
  //                        INIT
  // *************************************************************

  constructor(address _ve, address _rewardToken) {
    rewardToken = _rewardToken;
    ve = IVeNFT(_ve);
  }

  // *************************************************************
  //                      CHECKPOINT
  // *************************************************************

  /// @dev Make checkpoint and start new epoch. Anyone can call it.
  ///      This call can be done from multiple places and must not have reverts.
  function startNewEpoch() external {
    uint _epoch = epoch;
    address _rewardToken = rewardToken;
    uint tokenBalance = IERC20(_rewardToken).balanceOf(address(this));

    // do not start new epoch if zero balance
    if (tokenBalance == 0) {
      return;
    }

    EpochInfo memory _epochInfo = epochInfos[_epoch];
    uint newEpochTs = block.timestamp / WEEK * WEEK;

    // check epoch time only if we already started
    if (_epoch != 0 && _epochInfo.ts >= newEpochTs) {
      return;
    }

    uint tokenDiff = tokenBalance + tokensClaimedSinceLastSnapshot - _epochInfo.tokenBalance;
    // do nothing if no new rewards
    if (tokenDiff == 0) {
      return;
    }

    IVeNFT _ve = ve;
    _ve.checkpoint();
    uint veTotalSupply = _ve.totalSupplyAtT(newEpochTs);
    // we can use a simple invariant - sum of all balanceOfNFTAt must be equal to totalSupplyAtT
    uint rewardsPerToken = tokenDiff * 1e18 / veTotalSupply;

    // write states
    tokensClaimedSinceLastSnapshot = 0;
    epoch = _epoch + 1;
    epochInfos[_epoch + 1] = EpochInfo({
      ts: newEpochTs,
      rewardsPerToken: rewardsPerToken,
      tokenBalance: tokenBalance,
      veTotalSupply: veTotalSupply
    });

    emit Checkpoint(
      _epoch + 1,
      newEpochTs,
      tokenBalance,
      _epochInfo.tokenBalance,
      tokenDiff,
      rewardsPerToken,
      veTotalSupply
    );
  }

  // *************************************************************
  //                      CLAIM
  // *************************************************************

  /// @dev Return available to claim earned amount
  function claimable(uint _tokenId) public view returns (uint rewardsAmount) {
    uint curEpoch = epoch;
    uint _lastPaidEpoch = lastPaidEpoch[_tokenId];

    uint unpaidEpochCount = curEpoch > _lastPaidEpoch ? curEpoch - _lastPaidEpoch : 0;

    if (unpaidEpochCount == 0) {
      return 0;
    }

    // max depth is 200 epochs (~4 years), early rewards will be lost for this ve
    if (unpaidEpochCount > 200) {
      unpaidEpochCount = 200;
    }

    IVeNFT _ve = ve;

    for (uint i; i < unpaidEpochCount; ++i) {
      EpochInfo storage _epochInfo = epochInfos[_lastPaidEpoch + i + 1];
      uint balanceAtEpoch = _ve.balanceOfNFTAt(_tokenId, _epochInfo.ts);
      rewardsAmount += balanceAtEpoch * _epochInfo.rewardsPerToken / 1e18;
    }

    return rewardsAmount;
  }

  /// @dev Claim rewards for given veID
  function claim(uint _tokenId) public override returns (uint toClaim) {
    toClaim = claimable(_tokenId);

    if (toClaim != 0) {
      address owner = ve.ownerOf(_tokenId);
      require(msg.sender == owner, "not owner");

      lastPaidEpoch[_tokenId] = epoch;
      tokensClaimedSinceLastSnapshot += toClaim;

      IERC20(rewardToken).transfer(owner, toClaim);

      emit RewardsClaimed(_tokenId, owner, toClaim);
    }
  }

  /// @dev Claim rewards for given veIDs
  function claimMany(uint[] memory _tokenIds) external returns (bool success) {
    for (uint i = 0; i < _tokenIds.length; i++) {
      claim(_tokenIds[i]);
    }
    return true;
  }

}
