// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IVeNFT} from "./IVeNFT.sol";
import "./VeLib.sol";

/// @title Voting escrow NFT
/// @author belbix
contract VeNFT is ReentrancyGuard, ERC721Enumerable, IVeNFT {

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev Version of this contract. Adjust manually on each code modification.
  string public constant VERSION = "1.0.0";

  // *************************************************************
  //                        INIT
  // *************************************************************

  constructor(string calldata name, address[] calldata tokens, uint[] calldata weights) {
    _pointHistory[0].blk = block.number;
    _pointHistory[0].ts = block.timestamp;
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  function _S() internal pure returns (IVeNFT.VeNFTState storage s) {
    return VeLib._S();
  }

  function _baseURI(uint _tokenId) internal view override returns (string memory) {
    return VeLib.getTokenURI(_tokenId);
  }

  /// @dev Current block timestamp
  function blockTimestamp() external view returns (uint) {
    return block.timestamp;
  }

  function lockedEnd(uint _tokenId) external view override returns (uint) {
    return VeLib.lockedEnd(_tokenId);
  }

  /// @dev Return length of staking tokens.
  function tokensLength() external view returns (uint) {
    return _S().tokens.length;
  }

  function balanceOfNFT(uint _tokenId) external view override returns (uint) {
    return VeLib.balanceOfNFT(_tokenId, block.timestamp);
  }

  function balanceOfNFTAt(uint _tokenId, uint _t) external view override returns (uint) {
    return VeLib.balanceOfNFT(_tokenId, _t);
  }

  function totalSupply() external view returns (uint) {
    return VeLib.totalSupplyAtT(block.timestamp);
  }

  function balanceOfAtNFT(uint _tokenId, uint _block) external view returns (uint) {
    return VeLib._balanceOfAtNFT(_tokenId, _block);
  }

  function userPointHistory(uint _tokenId, uint _loc) external view override returns (Point memory point) {
    return VeLib.userPointHistory(_tokenId, _loc);
  }

  function pointHistory(uint _loc) external view override returns (Point memory point) {
    point = _S()._pointHistory[_loc];
    // we have a big simplification of the logic at this moment and just return current extra supply at any request epoch
    point.bias = point.bias + int128(int256(_S().additionalTotalSupply));
  }

  /// @notice Calculate total voting power
  /// @dev Adheres to the ERC20 `totalSupply` interface for Aragon compatibility
  /// @return Total voting power
  function totalSupplyAtT(uint t) public view override returns (uint) {
    return VeLib.totalSupplyAtT(t);
  }

  // *************************************************************
  //                        MAIN LOGIC
  // *************************************************************

  /// @notice Record global data to checkpoint
  function checkpoint() external override {
    _checkpoint(CheckpointInfo(0, 0, 0, 0, 0, false));
  }

  /// @notice Deposit `_value` tokens for `_to` and lock for `_lock_duration`
  /// @param _token Token for deposit. Should be whitelisted in this contract.
  /// @param _value Amount to deposit
  /// @param _lockDuration Number of seconds to lock tokens for (rounded down to nearest week)
  /// @param _to Address to deposit
  function createLockFor(address _token, uint _value, uint _lockDuration, address _to, bool alwaysMaxLock) external nonReentrant override returns (uint tokenId) {
    tokenId = VeLib.createLock(_token, _value, _lockDuration, _to, alwaysMaxLock);
    // todo mint
  }

  /// @notice Deposit `_value` additional tokens for `_tokenId` without modifying the unlock time
  /// @dev Anyone (even a smart contract) can deposit for someone else, but
  ///      cannot extend their locktime and deposit for a brand new user
  /// @param _token Token for deposit. Should be whitelisted in this contract.
  /// @param _tokenId ve token ID
  /// @param _value Amount of tokens to deposit and add to the lock
  function increaseAmount(address token, uint tokenId, uint value) external nonReentrant override {
    VeLib.increaseAmount(token, tokenId, value);
  }

  /// @notice Extend the unlock time for `_tokenId`
  /// @param _tokenId ve token ID
  /// @param _lockDuration New number of seconds until tokens unlock
  function increaseUnlockTime(uint _tokenId, uint _lockDuration) external nonReentrant returns (uint power, uint unlockDate)  {
    require(isApprovedOrOwner(msg.sender, tokenId), "NOT_OWNER");
    return VeLib.increaseUnlockTime(_tokenId, _lockDuration);
  }

  /// @dev Merge two NFTs union their balances and keep the biggest lock time.
  function merge(uint _from, uint _to) external nonReentrant {
    require(isApprovedOrOwner(msg.sender, _from) && isApprovedOrOwner(msg.sender, _to), "NOT_OWNER");

    VeLib.merge(_from, _to);

    // todo burn
  }

  /// @dev Split given veNFT. A new NFT will have a given percent of underlying tokens.
  /// @param _tokenId ve token ID
  /// @param percent percent of underlying tokens for new NFT with denominator 1e18 (1-(100e18-1)).
  function split(uint _tokenId, uint percent) external nonReentrant {
    require(isApprovedOrOwner(msg.sender, _tokenId), "NOT_OWNER");

    // todo mint
  }

  /// @notice Withdraw all staking tokens for `_tokenId`
  /// @dev Only possible if the lock has expired
  function withdrawAll(uint _tokenId) external {
    uint length = tokens.length;
    for (uint i; i < length; ++i) {
      address token = tokens[i];
      if (lockedAmounts[_tokenId][token] != 0) {
        withdraw(token, _tokenId);
      }
    }
  }

  /// @notice Withdraw given staking token for `_tokenId`
  /// @dev Only possible if the lock has expired
  function withdraw(address stakingToken, uint _tokenId) public nonReentrant {
    require(isApprovedOrOwner(msg.sender, _tokenId), "NOT_OWNER");

  }

}
