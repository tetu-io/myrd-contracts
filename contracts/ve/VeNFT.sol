// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "../interfaces/IVeNFT.sol";
import "../libs/VeLib.sol";

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

  constructor(string memory name, string memory symbol, address[] memory _tokens, uint[] memory weights) ERC721(name, symbol) {
    // Set initial state
    _S()._pointHistory[0].blk = block.number;
    _S()._pointHistory[0].ts = block.timestamp;

    // Add tokens
    require(_tokens.length == weights.length, "LENGTH_MISMATCH");
    for (uint i = 0; i < _tokens.length; i++) {
      VeLib.addToken(_tokens[i], weights[i]);
    }
  }

  // *************************************************************
  //                        VIEWS
  // *************************************************************

  function _S() internal pure returns (IVeNFT.VeNFTState storage s) {
    return VeLib._S();
  }

  function tokenURI(uint _tokenId) public view override returns (string memory) {
    _requireOwned(_tokenId);
    return VeLib.getTokenURI(_tokenId);
  }

  /// @dev Current block timestamp.
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

  function tokens(uint idx) external view returns (address) {
    return _S().tokens[idx];
  }

  function balanceOfNFT(uint _tokenId) external view override returns (uint) {
    return VeLib.balanceOfNFT(_tokenId);
  }

  function balanceOfNFTAt(uint _tokenId, uint _t) external view override returns (uint) {
    return VeLib._balanceOfNFT(_tokenId, _t);
  }

  /// @dev ATTENTION! this function return total underlying amount locked in this contract instead of total NFTs count.
  function totalSupply() public view override(ERC721Enumerable, IERC721Enumerable) returns (uint) {
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

  function isApprovedOrOwner(address spender, uint tokenId) public view returns (bool) {
    return _isAuthorized(_ownerOf(tokenId), spender, tokenId);
  }

  function userPointEpoch(uint tokenId) external override view returns (uint) {
    return _S().userPointEpoch[tokenId];
  }

  function totalSupplyAt(uint _block) external view returns (uint) {
    return VeLib.totalSupplyAt(_block);
  }

  function lockedDerivedAmount(uint veId) external view returns (uint) {
    return _S().lockedDerivedAmount[veId];
  }

  function lockedAmounts(uint veId, address stakingToken) external view returns (uint) {
    return _S().lockedAmounts[veId][stakingToken];
  }

  function epoch() external view returns (uint) {
    return _S().epoch;
  }

  function nftCount() external view returns (uint) {
    return _S().tokenId;
  }

  function additionalTotalSupply() external view returns (uint) {
    return _S().additionalTotalSupply;
  }

  function tokenWeight(address token) external view returns (uint) {
    return _S().tokenWeights[token];
  }

  function isValidToken(address token) external view returns (bool) {
    return _S().isValidToken[token];
  }

  function isAlwaysMaxLock(uint tokenId) external view returns (bool) {
    return _S().isAlwaysMaxLock[tokenId];
  }

  function maxLock() external pure override returns (uint) {
    return VeLib.MAX_TIME;
  }

  // *************************************************************
  //                        MAIN LOGIC
  // *************************************************************

  /// @notice Record global data to checkpoint. Anyone can call it.
  function checkpoint() external nonReentrant override {
    VeLib.makeEmptyCheckpoint();
  }

  /// @notice Deposit `_value` tokens for `_to` and lock for `_lock_duration`
  /// @param _token Token for deposit. Should be whitelisted in this contract.
  /// @param _value Amount to deposit
  /// @param _lockDuration Number of seconds to lock tokens for (rounded down to nearest week)
  /// @param _to Address to deposit
  function createLockFor(address _token, uint _value, uint _lockDuration, address _to, bool alwaysMaxLock) external nonReentrant override returns (uint tokenId) {
    tokenId = VeLib.createLock(_token, _value, _lockDuration, alwaysMaxLock);
    _mint(_to, tokenId);
  }

  /// @notice Deposit `_value` additional tokens for `_tokenId` without modifying the unlock time
  /// @dev Anyone (even a smart contract) can deposit for someone else, but
  ///      cannot extend their locktime and deposit for a brand new user
  /// @param token Token for deposit. Should be whitelisted in this contract.
  /// @param tokenId ve token ID
  /// @param value Amount of tokens to deposit and add to the lock
  function increaseAmount(address token, uint tokenId, uint value) external nonReentrant override {
    VeLib.increaseAmount(token, tokenId, value);
  }

  /// @notice Extend the unlock time for `_tokenId`
  /// @param _tokenId ve token ID
  /// @param _lockDuration New number of seconds until tokens unlock
  function increaseUnlockTime(uint _tokenId, uint _lockDuration) external nonReentrant returns (uint power, uint unlockDate)  {
    require(isApprovedOrOwner(msg.sender, _tokenId), "NOT_OWNER");
    return VeLib.increaseUnlockTime(_tokenId, _lockDuration);
  }

  /// @dev Merge two NFTs union their balances and keep the biggest lock time.
  function merge(uint _from, uint _to) external nonReentrant {
    require(isApprovedOrOwner(msg.sender, _from) && isApprovedOrOwner(msg.sender, _to), "NOT_OWNER");

    VeLib.merge(_from, _to);
    _burn(_from);
  }

  /// @dev Split given veNFT. A new NFT will have a given percent of underlying tokens.
  /// @param _tokenId ve token ID
  /// @param percent percent of underlying tokens for new NFT with denominator 1e18 (1-(100e18-1)).
  function split(uint _tokenId, uint percent) external nonReentrant returns (uint newTokenId){
    require(isApprovedOrOwner(msg.sender, _tokenId), "NOT_OWNER");

    newTokenId = VeLib.split(_tokenId, percent);
    _mint(_msgSender(), newTokenId);
  }

  /// @notice Withdraw all staked tokens for `_tokenId`
  /// @dev Only possible if the lock has expired
  function withdrawAll(uint _tokenId) external {
    uint length = _S().tokens.length;
    for (uint i; i < length; ++i) {
      address token = _S().tokens[i];
      if (_S().lockedAmounts[_tokenId][token] != 0) {
        withdraw(token, _tokenId);
      }
    }
  }

  /// @notice Withdraw given staking token for `_tokenId`
  /// @dev Only possible if the lock has expired
  function withdraw(address stakingToken, uint _tokenId) public nonReentrant {
    require(isApprovedOrOwner(msg.sender, _tokenId), "NOT_OWNER");

    uint newLockedDerivedAmount = VeLib.withdraw(stakingToken, _tokenId);

    // Burn the NFT
    if (newLockedDerivedAmount == 0) {
      _burn(_tokenId);
    }
  }

  function disableAlwaysMaxLock(uint tokenId) external nonReentrant {
    require(isApprovedOrOwner(msg.sender, tokenId), "NOT_OWNER");
    require(_S().isAlwaysMaxLock[tokenId], "WRONG_STATUS");

    VeLib._setAlwaysMaxLock(tokenId, false);
  }

}
