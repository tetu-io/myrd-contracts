// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../interfaces/IVeNFT.sol";
import "./StringLib.sol";
import "./Base64.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

library VeLib {
  using Math for uint;

  // *************************************************************
  //                        STRUCTS
  // *************************************************************

  enum DepositType {
    DEPOSIT_FOR_TYPE,
    CREATE_LOCK_TYPE,
    INCREASE_LOCK_AMOUNT,
    INCREASE_UNLOCK_TIME,
    MERGE_TYPE
  }

  struct DepositInfo {
    address stakingToken;
    uint tokenId;
    uint value;
    uint unlockTime;
    uint lockedAmount;
    uint lockedDerivedAmount;
    uint lockedEnd;
    DepositType depositType;
  }

  // Only for internal usage
  struct CheckpointInfo {
    uint tokenId;
    uint oldDerivedAmount;
    uint newDerivedAmount;
    uint oldEnd;
    uint newEnd;
    bool isAlwaysMaxLock;
  }

  struct CheckpointInfo2 {
    uint tokenId;
    uint oldDerivedAmount;
    uint newDerivedAmount;
    uint oldEnd;
    uint newEnd;
    uint epoch;
    IVeNFT.Point uOld;
    IVeNFT.Point uNew;
    int128 oldDSlope;
    int128 newDSlope;
  }

  // *************************************************************
  //                        EVENTS
  // *************************************************************

  event Deposit(
    address indexed stakingToken,
    address indexed provider,
    uint tokenId,
    uint value,
    uint indexed locktime,
    DepositType depositType,
    uint ts
  );
  event Withdraw(address indexed stakingToken, address indexed provider, uint tokenId, uint value, uint ts);
  event Merged(address indexed stakingToken, address indexed provider, uint from, uint to);
  event Split(uint parentTokenId, uint newTokenId, uint percent);
  event StakingTokenAdded(address value, uint weight);
  event AlwaysMaxLock(uint tokenId, bool status);

  // *************************************************************
  //                        CONSTANTS
  // *************************************************************

  /// @dev keccak256(abi.encode(uint256(keccak256("venft.main")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 private constant VE_NFT_STORAGE_LOCATION = 0x0aa675aeb8939d3b3f610e3aff882a67d690a71ed397f3ad260389ac999b4900;
  uint internal constant WEEK = 1 weeks;
  uint internal constant MAX_TIME = 365 days * 4;
  uint internal constant MULTIPLIER = 1 ether;

  int128 internal constant I_MAX_TIME = int128(int(MAX_TIME));
  uint internal constant WEIGHT_DENOMINATOR = 100e18;

  function _S() internal pure returns (IVeNFT.VeNFTState storage s) {
    assembly {
      s.slot := VE_NFT_STORAGE_LOCATION
    }
    return s;
  }

  // *************************************************************
  //                  VIEWS
  // *************************************************************

  function lockedEnd(uint _tokenId) internal view returns (uint) {
    if (_S().isAlwaysMaxLock[_tokenId]) {
      return (block.timestamp + MAX_TIME) / WEEK * WEEK;
    } else {
      return _S()._lockedEndReal[_tokenId];
    }
  }

  function balanceOfNFT(uint _tokenId) internal view returns (uint) {
    return _balanceOfNFT(_tokenId, block.timestamp);
  }

  function userPointHistory(uint _tokenId, uint _loc) internal view returns (IVeNFT.Point memory point) {
    if (_S().isAlwaysMaxLock[_tokenId]) {
      return IVeNFT.Point({
        bias: int128(int256(_S().lockedDerivedAmount[_tokenId])),
        slope: 0,
        ts: (block.timestamp - MAX_TIME) / WEEK * WEEK, // this represent a simulation that we locked MAX TIME ago, need for VeDist
        blk: block.number
      });
    }

    point = _S()._userPointHistory[_tokenId][_loc];
  }

  /// @notice Calculate total voting power
  /// @dev Adheres to the ERC20 `totalSupply` interface for Aragon compatibility
  /// @return Total voting power
  function totalSupplyAtT(uint t) internal view returns (uint) {
    IVeNFT.Point memory lastPoint = _S()._pointHistory[_S().epoch];
    return calcSupplyAt(lastPoint, t, _S().slopeChanges) + _S().additionalTotalSupply;
  }

  /// @notice Calculate total voting power at some point in the past
  /// @param _block Block to calculate the total voting power at
  /// @return Total voting power at `_block`
  function totalSupplyAt(uint _block) internal view returns (uint) {
    return calcTotalSupplyAt(
      _block,
      _S().epoch,
      _S()._pointHistory,
      _S().slopeChanges
    ) + _S().additionalTotalSupply;
  }

  function _lockInfo(address stakingToken, uint veId) internal view returns (
    uint _lockedAmount,
    uint _lockedDerivedAmount,
    uint _lockedEnd
  ) {
    _lockedAmount = _S().lockedAmounts[veId][stakingToken];
    _lockedDerivedAmount = _S().lockedDerivedAmount[veId];
    _lockedEnd = lockedEnd(veId);
  }

  /// @dev Returns current token URI metadata
  /// @param _tokenId Token ID to fetch URI for.
  function getTokenURI(uint _tokenId) internal view returns (string memory) {
    uint _lockedEnd = lockedEnd(_tokenId);
    return logo(
      _tokenId,
      uint(int256(_S().lockedDerivedAmount[_tokenId])),
      block.timestamp < _lockedEnd ? _lockedEnd - block.timestamp : 0,
      _balanceOfNFT(_tokenId, block.timestamp)
    );
  }

  // *************************************************************
  //                  MISC
  // *************************************************************

  function addToken(address token, uint weight) internal {
    require(token != address(0) && weight != 0 && IERC20Metadata(token).decimals() == 18, "WRONG_INPUT");

    uint length = _S().tokens.length;
    for (uint i; i < length; ++i) {
      require(token != _S().tokens[i], "WRONG_INPUT");
    }

    _S().tokens.push(token);
    _S().tokenWeights[token] = weight;
    _S().isValidToken[token] = true;

    emit StakingTokenAdded(token, weight);
  }

  // *************************************************************
  //                  DEPOSIT/WITHDRAW LOGIC
  // *************************************************************

  /// @dev Transfer underlying token to recipient
  function _transferUnderlyingToken(address token, address recipient, uint amount) internal {
    IERC20(token).transfer(recipient, amount);
  }

  /// @dev Pull tokens to this contract
  function _pullUnderlyingToken(address _token, address _from, uint amount) internal {
    IERC20(_token).transferFrom(_from, address(this), amount);
  }

  /// @notice Deposit and lock tokens for a user
  function depositFor(DepositInfo memory info) internal {

    uint newLockedDerivedAmount = info.lockedDerivedAmount;
    if (info.value != 0) {

      // calculate new amounts
      uint newAmount = info.lockedAmount + info.value;
      newLockedDerivedAmount = calculateDerivedAmount(
        info.lockedAmount,
        info.lockedDerivedAmount,
        newAmount,
        _S().tokenWeights[info.stakingToken],
        IERC20Metadata(info.stakingToken).decimals()
      );
      // update chain info
      _S().lockedAmounts[info.tokenId][info.stakingToken] = newAmount;
      _updateLockedDerivedAmount(info.tokenId, newLockedDerivedAmount);
    }

    // Adding to existing lock, or if a lock is expired - creating a new one
    uint newLockedEnd = info.lockedEnd;
    if (info.unlockTime != 0) {
      _S()._lockedEndReal[info.tokenId] = info.unlockTime;
      newLockedEnd = info.unlockTime;
    }

    // update checkpoint
    _checkpoint(CheckpointInfo(
      info.tokenId,
      info.lockedDerivedAmount,
      newLockedDerivedAmount,
      info.lockedEnd,
      newLockedEnd,
      _S().isAlwaysMaxLock[info.tokenId]
    ));

    // move tokens to this contract, if necessary
    address from = msg.sender;
    if (info.value != 0 && info.depositType != DepositType.MERGE_TYPE) {
      _pullUnderlyingToken(info.stakingToken, from, info.value);
    }

    emit Deposit(info.stakingToken, from, info.tokenId, info.value, newLockedEnd, info.depositType, block.timestamp);
  }

  function _incrementTokenIdAndGet() internal returns (uint id){
    id = _S().tokenId + 1;
    _S().tokenId = id;
  }

  function _setAlwaysMaxLock(uint _tokenId, bool status) internal {

    // need to setup first, it will be checked later
    _S().isAlwaysMaxLock[_tokenId] = status;

    uint _derivedAmount = _S().lockedDerivedAmount[_tokenId];
    uint maxLockDuration = (block.timestamp + MAX_TIME) / WEEK * WEEK;

    // the idea is exclude nft from checkpoint calculations when max lock activated and count the balance as is
    if (status) {
      // need to increase additional total supply for properly calculation
      _S().additionalTotalSupply += _derivedAmount;

      // set checkpoints to zero
      _checkpoint(CheckpointInfo(
        _tokenId,
        _derivedAmount,
        0,
        _S()._lockedEndReal[_tokenId],
        0,
        false // need to use false for this fake update
      ));
    } else {
      // remove from additional supply
      require(_S().additionalTotalSupply >= _derivedAmount, "WRONG_SUPPLY");
      _S().additionalTotalSupply -= _derivedAmount;
      // if we disable need to set real lock end to max value
      _S()._lockedEndReal[_tokenId] = maxLockDuration;
      // and activate real checkpoints + total supply
      _checkpoint(CheckpointInfo(
        _tokenId,
        0, // it was setup to zero when we set always max lock
        _derivedAmount,
        maxLockDuration,
        maxLockDuration,
        false
      ));
    }

    emit AlwaysMaxLock(_tokenId, status);
  }

  function _updateLockedDerivedAmount(uint _tokenId, uint amount) internal {
    uint cur = _S().lockedDerivedAmount[_tokenId];
    if (cur == amount) {
      // if did not change do nothing
      return;
    }

    if (_S().isAlwaysMaxLock[_tokenId]) {
      if (cur > amount) {
        _S().additionalTotalSupply -= (cur - amount);
      } else if (cur < amount) {
        _S().additionalTotalSupply += amount - cur;
      }
    }

    _S().lockedDerivedAmount[_tokenId] = amount;
  }

  /// @notice Deposit `_value` tokens for `_to` and lock for `_lock_duration`
  /// @param token Token for deposit. Should be whitelisted in this contract.
  /// @param value Amount to deposit
  /// @param lockDuration Number of seconds to lock tokens for (rounded down to nearest week)
  function createLock(address token, uint value, uint lockDuration, bool alwaysMaxLock) internal returns (uint tokenId) {
    require(value > 0, "WRONG_INPUT");
    // Lock time is rounded down to weeks
    uint unlockTime = (block.timestamp + lockDuration) / WEEK * WEEK;
    require(unlockTime > block.timestamp, "LOW_LOCK_PERIOD");
    require(unlockTime <= block.timestamp + MAX_TIME, "HIGH_LOCK_PERIOD");
    require(_S().isValidToken[token], "INVALID_TOKEN");

    tokenId = _incrementTokenIdAndGet();

    depositFor(DepositInfo({
      stakingToken: token,
      tokenId: tokenId,
      value: value,
      unlockTime: unlockTime,
      lockedAmount: 0,
      lockedDerivedAmount: 0,
      lockedEnd: 0,
      depositType: DepositType.CREATE_LOCK_TYPE
    }));

    // we should allow to set always max lock only on creation process
    // otherwise we should have dependency on other contracts for properly check that actions completed
    // if a user want to start withdraw process he can use split function
    if (alwaysMaxLock) {
      // it is not optimised flow, some actions will be duplicated, but it is more secure at the current stage
      _setAlwaysMaxLock(tokenId, true);
    }
  }

  /// @notice Deposit `_value` additional tokens for `_tokenId` without modifying the unlock time
  /// @dev Anyone (even a smart contract) can deposit for someone else, but
  ///      cannot extend their locktime and deposit for a brand new user
  /// @param token Token for deposit. Should be whitelisted in this contract.
  /// @param tokenId ve token ID
  /// @param value Amount of tokens to deposit and add to the lock
  function increaseAmount(address token, uint tokenId, uint value) internal {
    require(value > 0, "WRONG_INPUT");
    (uint _lockedAmount, uint _lockedDerivedAmount, uint _lockedEnd) = _lockInfo(token, tokenId);

    require(_lockedDerivedAmount > 0, "NFT_WITHOUT_POWER");
    require(_lockedEnd > block.timestamp, "EXPIRED");
    require(_S().isValidToken[token], "INVALID_TOKEN");

    depositFor(DepositInfo({
      stakingToken: token,
      tokenId: tokenId,
      value: value,
      unlockTime: 0,
      lockedAmount: _lockedAmount,
      lockedDerivedAmount: _lockedDerivedAmount,
      lockedEnd: _lockedEnd,
      depositType: DepositType.INCREASE_LOCK_AMOUNT
    }));
  }

  /// @notice Extend the unlock time for `_tokenId`
  /// @param tokenId ve token ID
  /// @param lockDuration New number of seconds until tokens unlock
  function increaseUnlockTime(uint tokenId, uint lockDuration) internal returns (uint power, uint unlockDate)  {

    uint lockedDerivedAmount = _S().lockedDerivedAmount[tokenId];
    uint _lockedEnd = _S()._lockedEndReal[tokenId];

    // Lock time is rounded down to weeks
    uint unlockTime = (block.timestamp + lockDuration) / WEEK * WEEK;
    require(!_S().isAlwaysMaxLock[tokenId], "ALWAYS_MAX_LOCK");
    require(lockedDerivedAmount > 0, "NFT_WITHOUT_POWER");
    require(_lockedEnd > block.timestamp, "EXPIRED");
    require(unlockTime > _lockedEnd, "LOW_UNLOCK_TIME");
    require(unlockTime <= block.timestamp + MAX_TIME, "HIGH_LOCK_PERIOD");

    depositFor(DepositInfo({
      stakingToken: address(0),
      tokenId: tokenId,
      value: 0,
      unlockTime: unlockTime,
      lockedAmount: 0,
      lockedDerivedAmount: lockedDerivedAmount,
      lockedEnd: _lockedEnd,
      depositType: DepositType.INCREASE_UNLOCK_TIME
    }));

    power = balanceOfNFT(tokenId);
    unlockDate = _S()._lockedEndReal[tokenId];
  }

  /// @dev Merge two NFTs union their balances and keep the biggest lock time.
  function merge(uint _from, uint _to) internal {
    require(_from != _to, "IDENTICAL_ADDRESS");

    // deactivate always max lock if it is active for properly calculations
    bool isAlwaysMaxLockActive;
    if (_S().isAlwaysMaxLock[_from]) {
      isAlwaysMaxLockActive = true;
      _setAlwaysMaxLock(_from, false);
    }
    if (_S().isAlwaysMaxLock[_to]) {
      isAlwaysMaxLockActive = true;
      _setAlwaysMaxLock(_to, false);
    }

    uint lockedEndFrom = lockedEnd(_from);
    uint lockedEndTo = lockedEnd(_to);
    require(lockedEndFrom > block.timestamp && lockedEndTo > block.timestamp, "EXPIRED");
    uint end = lockedEndFrom >= lockedEndTo ? lockedEndFrom : lockedEndTo;
    uint oldDerivedAmount = _S().lockedDerivedAmount[_from];

    uint length = _S().tokens.length;
    // we should use the old one for properly calculate checkpoint for the new ve
    uint newLockedEndTo = lockedEndTo;
    for (uint i; i < length; i++) {
      address stakingToken = _S().tokens[i];
      uint _lockedAmountFrom = _S().lockedAmounts[_from][stakingToken];
      if (_lockedAmountFrom == 0) {
        continue;
      }
      _S().lockedAmounts[_from][stakingToken] = 0;

      depositFor(DepositInfo({
        stakingToken: stakingToken,
        tokenId: _to,
        value: _lockedAmountFrom,
        unlockTime: end,
        lockedAmount: _S().lockedAmounts[_to][stakingToken],
        lockedDerivedAmount: _S().lockedDerivedAmount[_to],
        lockedEnd: newLockedEndTo,
        depositType: DepositType.MERGE_TYPE
      }));

      // set new lock time to the current end lock
      newLockedEndTo = end;

      emit Merged(stakingToken, msg.sender, _from, _to);
    }

    _updateLockedDerivedAmount(_from, 0);
    _S()._lockedEndReal[_from] = 0;

    // update checkpoint
    _checkpoint(CheckpointInfo(
      _from,
      oldDerivedAmount,
      0,
      lockedEndFrom,
      lockedEndFrom,
      false // at this step it should be always false
    ));

    // activate always max lock if it was active before
    if (isAlwaysMaxLockActive) {
      _setAlwaysMaxLock(_to, true);
    }
  }

  /// @dev Split given veNFT. A new NFT will have a given percent of underlying tokens.
  /// @param _tokenId ve token ID
  /// @param percent percent of underlying tokens for new NFT with denominator 1e18 (1-(100e18-1)).
  function split(uint _tokenId, uint percent) internal returns (uint newTokenId) {
    // deactivate always max lock if it is active for properly calculations
    bool isAlwaysMaxLockActive = _S().isAlwaysMaxLock[_tokenId];
    if (isAlwaysMaxLockActive) {
      _setAlwaysMaxLock(_tokenId, false);
    }

    require(percent != 0 && percent < 100e18, "WRONG_INPUT");

    uint lockedDerivedAmount = _S().lockedDerivedAmount[_tokenId];
    uint oldLockedDerivedAmount = lockedDerivedAmount;
    uint _lockedEnd = lockedEnd(_tokenId);

    require(_lockedEnd > block.timestamp, "EXPIRED");

    // crete new NFT
    newTokenId = _incrementTokenIdAndGet();

    // migrate percent of locked tokens to the new NFT
    uint length = _S().tokens.length;
    for (uint i; i < length; ++i) {
      address stakingToken = _S().tokens[i];
      uint _lockedAmount = _S().lockedAmounts[_tokenId][stakingToken];
      if (_lockedAmount == 0) {
        continue;
      }
      uint amountForNewNFT = _lockedAmount * percent / 100e18;
      require(amountForNewNFT != 0, "LOW_PERCENT");

      lockedDerivedAmount = calculateDerivedAmount(
        _lockedAmount,
        lockedDerivedAmount,
        _lockedAmount - amountForNewNFT,
        _S().tokenWeights[stakingToken],
        IERC20Metadata(stakingToken).decimals()
      );

      _S().lockedAmounts[_tokenId][stakingToken] = _lockedAmount - amountForNewNFT;

      // increase values for new NFT
      depositFor(DepositInfo({
        stakingToken: stakingToken,
        tokenId: newTokenId,
        value: amountForNewNFT,
        unlockTime: _lockedEnd,
        lockedAmount: 0,
        lockedDerivedAmount: _S().lockedDerivedAmount[newTokenId],
        lockedEnd: _lockedEnd,
        depositType: DepositType.MERGE_TYPE
      }));

      // activate always max lock if it was active before
      if (isAlwaysMaxLockActive) {
        _setAlwaysMaxLock(_tokenId, true);
      }
    }

    _updateLockedDerivedAmount(_tokenId, lockedDerivedAmount);

    // update checkpoint
    _checkpoint(CheckpointInfo(
      _tokenId,
      oldLockedDerivedAmount,
      lockedDerivedAmount,
      _lockedEnd,
      _lockedEnd,
      false // at this step it should be always false
    ));

    emit Split(_tokenId, newTokenId, percent);
  }

  /// @notice Withdraw given staking token for `_tokenId`
  /// @dev Only possible if the lock has expired
  function withdraw(address stakingToken, uint _tokenId) internal returns (uint newLockedDerivedAmount){
    (uint oldLockedAmount, uint oldLockedDerivedAmount, uint oldLockedEnd) = _lockInfo(stakingToken, _tokenId);

    require(block.timestamp >= oldLockedEnd, "NOT_EXPIRED");
    require(oldLockedAmount > 0, "ZERO_LOCKED");
    require(!_S().isAlwaysMaxLock[_tokenId], "ALWAYS_MAX_LOCK");


    newLockedDerivedAmount = calculateDerivedAmount(
      oldLockedAmount,
      oldLockedDerivedAmount,
      0,
      _S().tokenWeights[stakingToken],
      IERC20Metadata(stakingToken).decimals()
    );

    // if no tokens set lock to zero
    uint newLockEnd = oldLockedEnd;
    if (newLockedDerivedAmount == 0) {
      _S()._lockedEndReal[_tokenId] = 0;
      newLockEnd = 0;
    }

    // update derived amount
    _updateLockedDerivedAmount(_tokenId, newLockedDerivedAmount);

    // set locked amount to zero, we will withdraw all
    _S().lockedAmounts[_tokenId][stakingToken] = 0;

    // update checkpoint
    _checkpoint(CheckpointInfo(
      _tokenId,
      oldLockedDerivedAmount,
      newLockedDerivedAmount,
      oldLockedEnd,
      newLockEnd,
      false // already checked and can not be true
    ));

    _transferUnderlyingToken(stakingToken, msg.sender, oldLockedAmount);

    emit Withdraw(stakingToken, msg.sender, _tokenId, oldLockedAmount, block.timestamp);
  }

  ////////////////////////////////////////////////////
  //  INTERNAL CALCULATIONS
  ////////////////////////////////////////////////////

  /// @notice Get the voting power for `_tokenId` at given timestamp
  /// @dev Adheres to the ERC20 `balanceOf` interface for Aragon compatibility
  /// @param _tokenId NFT for lock
  /// @param ts Epoch time to return voting power at
  /// @return User voting power
  function _balanceOfNFT(uint _tokenId, uint ts) internal view returns (uint) {
    // with max lock return balance as is
    if (_S().isAlwaysMaxLock[_tokenId]) {
      return _S().lockedDerivedAmount[_tokenId];
    }

    uint _epoch = _S().userPointEpoch[_tokenId];
    if (_epoch == 0) {
      return 0;
    } else {
      // Binary search
      uint _min = 0;
      uint _max = _epoch;
      for (uint i = 0; i < 128; ++i) {
        // Will be always enough for 128-bit numbers
        if (_min >= _max) {
          break;
        }
        uint _mid = (_min + _max + 1) / 2;
        if (_S()._userPointHistory[_tokenId][_mid].ts <= ts) {
          _min = _mid;
        } else {
          _max = _mid - 1;
        }
      }
      IVeNFT.Point memory lastPoint = _S()._userPointHistory[_tokenId][_min];

      if (lastPoint.ts > ts) {
        return 0;
      }

      // calculate power at concrete point of time, it can be higher on past and lower in future
      lastPoint.bias -= lastPoint.slope * int128(int256(ts) - int256(lastPoint.ts));
      // case if lastPoint.bias > than real locked amount means requested timestamp early than creation time
      if (lastPoint.bias < 0 || uint(int256(lastPoint.bias)) > _S().lockedDerivedAmount[_tokenId]) {
        return 0;
      }
      return uint(int256(lastPoint.bias));
    }
  }

  function makeEmptyCheckpoint() internal {
    _checkpoint(CheckpointInfo(0, 0, 0, 0, 0, false));
  }

  /// @notice Record global and per-user data to checkpoint
  function _checkpoint(CheckpointInfo memory info) internal {

    // we do not need checkpoints for always max lock
    if (info.isAlwaysMaxLock) {
      return;
    }

    uint _epoch = _S().epoch;
    uint newEpoch = makeCheckpoint(
      info.tokenId,
      info.oldDerivedAmount,
      info.newDerivedAmount,
      info.oldEnd,
      info.newEnd,
      _epoch,
      _S().slopeChanges,
      _S().userPointEpoch,
      _S()._userPointHistory,
      _S()._pointHistory
    );

    if (newEpoch != 0 && newEpoch != _epoch) {
      _S().epoch = newEpoch;
    }
  }

  function calculateDerivedAmount(
    uint currentAmount,
    uint oldDerivedAmount,
    uint newAmount,
    uint weight,
    uint8 decimals
  ) internal pure returns (uint) {
    // subtract current derived balance
    // rounded to UP for subtracting closer to 0 value
    if (oldDerivedAmount != 0 && currentAmount != 0) {
      currentAmount = currentAmount.mulDiv(1e18, 10 ** decimals, Math.Rounding.Ceil);
      uint currentDerivedAmount = currentAmount.mulDiv(weight, WEIGHT_DENOMINATOR, Math.Rounding.Ceil);
      if (oldDerivedAmount > currentDerivedAmount) {
        oldDerivedAmount -= currentDerivedAmount;
      } else {
        // in case of wrong rounding better to set to zero than revert
        oldDerivedAmount = 0;
      }
    }

    // recalculate derived amount with new amount
    // rounded to DOWN
    // normalize decimals to 18
    newAmount = newAmount.mulDiv(1e18, 10 ** decimals, Math.Rounding.Floor);
    // calculate the final amount based on the weight
    newAmount = newAmount.mulDiv(weight, WEIGHT_DENOMINATOR, Math.Rounding.Floor);
    return oldDerivedAmount + newAmount;
  }

  /// @notice Binary search to estimate timestamp for block number
  /// @param _block Block to find
  /// @param maxEpoch Don't go beyond this epoch
  /// @return Approximate timestamp for block
  function findBlockEpoch(uint _block, uint maxEpoch, mapping(uint => IVeNFT.Point) storage _pointHistory) internal view returns (uint) {
    // Binary search
    uint _min = 0;
    uint _max = maxEpoch;
    for (uint i = 0; i < 128; ++i) {
      // Will be always enough for 128-bit numbers
      if (_min >= _max) {
        break;
      }
      uint _mid = (_min + _max + 1) / 2;
      if (_pointHistory[_mid].blk <= _block) {
        _min = _mid;
      } else {
        _max = _mid - 1;
      }
    }
    return _min;
  }

  /// @notice Measure voting power of `_tokenId` at block height `_block`
  /// @dev Adheres to MiniMe `balanceOfAt` interface: https://github.com/Giveth/minime
  /// @param _tokenId User's wallet NFT
  /// @param _block Block to calculate the voting power at
  /// @return Voting power
  function _balanceOfAtNFT(uint _tokenId, uint _block) internal view returns (uint) {
    // for always max lock just return full derived amount
    if (_S().isAlwaysMaxLock[_tokenId]) {
      return _S().lockedDerivedAmount[_tokenId];
    }

    return calcBalanceOfAtNFT(
      _tokenId,
      _block,
      _S().epoch,
      _S().lockedDerivedAmount[_tokenId],
      _S().userPointEpoch,
      _S()._userPointHistory,
      _S()._pointHistory
    );
  }

  /// @notice Measure voting power of `_tokenId` at block height `_block`
  /// @return resultBalance Voting power
  function calcBalanceOfAtNFT(
    uint _tokenId,
    uint _block,
    uint maxEpoch,
    uint lockedDerivedAmount,
    mapping(uint => uint) storage userPointEpoch,
    mapping(uint => IVeNFT.Point[1000000000]) storage _userPointHistory,
    mapping(uint => IVeNFT.Point) storage _pointHistory
  ) internal view returns (uint resultBalance) {

    // Binary search closest user point
    uint _min = 0;
    {
      uint _max = userPointEpoch[_tokenId];
      for (uint i = 0; i < 128; ++i) {
        // Will be always enough for 128-bit numbers
        if (_min >= _max) {
          break;
        }
        uint _mid = (_min + _max + 1) / 2;
        if (_userPointHistory[_tokenId][_mid].blk <= _block) {
          _min = _mid;
        } else {
          _max = _mid - 1;
        }
      }
    }

    IVeNFT.Point memory uPoint = _userPointHistory[_tokenId][_min];

    // nft does not exist at this block
    if (uPoint.blk > _block) {
      return 0;
    }

    // need to calculate timestamp for the given block
    uint blockTime;
    if (_block <= block.number) {
      uint _epoch = findBlockEpoch(_block, maxEpoch, _pointHistory);
      IVeNFT.Point memory point0 = _pointHistory[_epoch];
      uint dBlock = 0;
      uint dt = 0;
      if (_epoch < maxEpoch) {
        IVeNFT.Point memory point1 = _pointHistory[_epoch + 1];
        dBlock = point1.blk - point0.blk;
        dt = point1.ts - point0.ts;
      } else {
        dBlock = block.number - point0.blk;
        dt = block.timestamp - point0.ts;
      }
      blockTime = point0.ts;
      if (dBlock != 0 && _block > point0.blk) {
        blockTime += (dt * (_block - point0.blk)) / dBlock;
      }
    } else {
      // we can not calculate estimation if no checkpoints
      if (maxEpoch == 0) {
        return 0;
      }
      // for future blocks will use a simple estimation
      IVeNFT.Point memory point0 = _pointHistory[maxEpoch - 1];
      uint tsPerBlock18 = (block.timestamp - point0.ts) * 1e18 / (block.number - point0.blk);
      blockTime = block.timestamp + tsPerBlock18 * (_block - block.number) / 1e18;
    }

    uPoint.bias -= uPoint.slope * int128(int256(blockTime - uPoint.ts));

    resultBalance = uint(uint128(toPositiveInt128(uPoint.bias)));

    // make sure we do not return more than nft has
    if (resultBalance > lockedDerivedAmount) {
      return 0;
    }
  }

  /// @notice Calculate total voting power at some point in the past
  /// @param point The point (bias/slope) to start search from
  /// @param t Time to calculate the total voting power at
  /// @return Total voting power at that time
  function calcSupplyAt(IVeNFT.Point memory point, uint t, mapping(uint => int128) storage slopeChanges) internal view returns (uint) {
    // this function will return positive value even for block when contract does not exist
    // for reduce gas cost we assume that it will not be used in such form

    IVeNFT.Point memory lastPoint = point;
    uint ti = (lastPoint.ts / WEEK) * WEEK;
    for (uint i = 0; i < 255; ++i) {
      ti += WEEK;
      int128 dSlope = 0;
      if (ti > t) {
        ti = t;
      } else {
        dSlope = slopeChanges[ti];
      }
      lastPoint.bias -= lastPoint.slope * int128(int256(ti) - int256(lastPoint.ts));
      if (ti == t) {
        break;
      }
      lastPoint.slope += dSlope;
      lastPoint.ts = ti;
    }
    return uint(uint128(toPositiveInt128(lastPoint.bias)));
  }

  /// @notice Calculate total voting power at some point in the past
  /// @param _block Block to calculate the total voting power at
  /// @return Total voting power at `_block`
  function calcTotalSupplyAt(
    uint _block,
    uint _epoch,
    mapping(uint => IVeNFT.Point) storage _pointHistory,
    mapping(uint => int128) storage slopeChanges
  ) internal view returns (uint) {
    require(_block <= block.number, "WRONG_INPUT");

    uint targetEpoch = findBlockEpoch(_block, _epoch, _pointHistory);

    IVeNFT.Point memory point = _pointHistory[targetEpoch];
    // it is possible only for a block before the launch
    // return 0 as more clear answer than revert
    if (point.blk > _block) {
      return 0;
    }
    uint dt = 0;
    if (targetEpoch < _epoch) {
      IVeNFT.Point memory pointNext = _pointHistory[targetEpoch + 1];
      // next point block can not be the same or lower
      dt = ((_block - point.blk) * (pointNext.ts - point.ts)) / (pointNext.blk - point.blk);
    } else {
      if (point.blk != block.number) {
        dt = ((_block - point.blk) * (block.timestamp - point.ts)) / (block.number - point.blk);
      }
    }
    // Now dt contains info on how far are we beyond point
    return calcSupplyAt(point, point.ts + dt, slopeChanges);
  }

  /// @notice Record global and per-user data to checkpoint
  function makeCheckpoint(
    uint tokenId,
    uint oldDerivedAmount,
    uint newDerivedAmount,
    uint oldEnd,
    uint newEnd,
    uint epoch,
    mapping(uint => int128) storage slopeChanges,
    mapping(uint => uint) storage userPointEpoch,
    mapping(uint => IVeNFT.Point[1000000000]) storage _userPointHistory,
    mapping(uint => IVeNFT.Point) storage _pointHistory
  ) internal returns (uint newEpoch) {
    IVeNFT.Point memory uOld;
    IVeNFT.Point memory uNew;
    return _makeCheckpoint(
      CheckpointInfo2({
        tokenId: tokenId,
        oldDerivedAmount: oldDerivedAmount,
        newDerivedAmount: newDerivedAmount,
        oldEnd: oldEnd,
        newEnd: newEnd,
        epoch: epoch,
        uOld: uOld,
        uNew: uNew,
        oldDSlope: 0,
        newDSlope: 0
      }),
      slopeChanges,
      userPointEpoch,
      _userPointHistory,
      _pointHistory
    );
  }

  function _makeCheckpoint(
    CheckpointInfo2 memory info,
    mapping(uint => int128) storage slopeChanges,
    mapping(uint => uint) storage userPointEpoch,
    mapping(uint => IVeNFT.Point[1000000000]) storage _userPointHistory,
    mapping(uint => IVeNFT.Point) storage _pointHistory
  ) internal returns (uint newEpoch) {

    if (info.tokenId != 0) {
      // Calculate slopes and biases
      // Kept at zero when they have to
      if (info.oldEnd > block.timestamp && info.oldDerivedAmount > 0) {
        info.uOld.slope = int128(uint128(info.oldDerivedAmount)) / I_MAX_TIME;
        info.uOld.bias = info.uOld.slope * int128(int256(info.oldEnd - block.timestamp));
      }
      if (info.newEnd > block.timestamp && info.newDerivedAmount > 0) {
        info.uNew.slope = int128(uint128(info.newDerivedAmount)) / I_MAX_TIME;
        info.uNew.bias = info.uNew.slope * int128(int256(info.newEnd - block.timestamp));
      }

      // Read values of scheduled changes in the slope
      // oldLocked.end can be in the past and in the future
      // newLocked.end can ONLY by in the FUTURE unless everything expired: than zeros
      info.oldDSlope = slopeChanges[info.oldEnd];
      if (info.newEnd != 0) {
        if (info.newEnd == info.oldEnd) {
          info.newDSlope = info.oldDSlope;
        } else {
          info.newDSlope = slopeChanges[info.newEnd];
        }
      }
    }

    IVeNFT.Point memory lastPoint = IVeNFT.Point({bias: 0, slope: 0, ts: block.timestamp, blk: block.number});
    if (info.epoch > 0) {
      lastPoint = _pointHistory[info.epoch];
    }
    uint lastCheckpoint = lastPoint.ts;
    // initialLastPoint is used for extrapolation to calculate block number
    // (approximately, for *At methods) and save them
    // as we cannot figure that out exactly from inside the contract
    IVeNFT.Point memory initialLastPoint = lastPoint;
    uint blockSlope = 0;
    // dblock/dt
    if (block.timestamp > lastPoint.ts) {
      blockSlope = (MULTIPLIER * (block.number - lastPoint.blk)) / (block.timestamp - lastPoint.ts);
    }
    // If last point is already recorded in this block, slope=0
    // But that's ok b/c we know the block in such case

    // Go over weeks to fill history and calculate what the current point is
    {
      uint ti = (lastCheckpoint / WEEK) * WEEK;
      // Hopefully it won't happen that this won't get used in 5 years!
      // If it does, users will be able to withdraw but vote weight will be broken
      for (uint i = 0; i < 255; ++i) {
        ti += WEEK;
        int128 dSlope = 0;
        if (ti > block.timestamp) {
          ti = block.timestamp;
        } else {
          dSlope = slopeChanges[ti];
        }
        lastPoint.bias = toPositiveInt128(lastPoint.bias - lastPoint.slope * int128(int256(ti - lastCheckpoint)));
        lastPoint.slope = toPositiveInt128(lastPoint.slope + dSlope);
        lastCheckpoint = ti;
        lastPoint.ts = ti;
        lastPoint.blk = initialLastPoint.blk + (blockSlope * (ti - initialLastPoint.ts)) / MULTIPLIER;
        info.epoch += 1;
        if (ti == block.timestamp) {
          lastPoint.blk = block.number;
          break;
        } else {
          _pointHistory[info.epoch] = lastPoint;
        }
      }
    }

    newEpoch = info.epoch;
    // Now pointHistory is filled until t=now

    if (info.tokenId != 0) {
      // If last point was in this block, the slope change has been applied already
      // But in such case we have 0 slope(s)
      lastPoint.slope = toPositiveInt128(lastPoint.slope + (info.uNew.slope - info.uOld.slope));
      lastPoint.bias = toPositiveInt128(lastPoint.bias + (info.uNew.bias - info.uOld.bias));
    }

    // Record the changed point into history
    _pointHistory[info.epoch] = lastPoint;

    if (info.tokenId != 0) {
      // Schedule the slope changes (slope is going down)
      // We subtract newUserSlope from [newLocked.end]
      // and add old_user_slope to [old_locked.end]
      if (info.oldEnd > block.timestamp) {
        // old_dslope was <something> - u_old.slope, so we cancel that
        info.oldDSlope += info.uOld.slope;
        if (info.newEnd == info.oldEnd) {
          info.oldDSlope -= info.uNew.slope;
          // It was a new deposit, not extension
        }
        slopeChanges[info.oldEnd] = info.oldDSlope;
      }

      if (info.newEnd > block.timestamp) {
        if (info.newEnd > info.oldEnd) {
          info.newDSlope -= info.uNew.slope;
          // old slope disappeared at this point
          slopeChanges[info.newEnd] = info.newDSlope;
        }
        // else: we recorded it already in oldDSlope
      }
      // Now handle user history
      uint userEpoch = userPointEpoch[info.tokenId] + 1;

      userPointEpoch[info.tokenId] = userEpoch;
      info.uNew.ts = block.timestamp;
      info.uNew.blk = block.number;
      _userPointHistory[info.tokenId][userEpoch] = info.uNew;
    }
  }

  function toPositiveInt128(int128 value) internal pure returns (int128) {
    return value < 0 ? int128(0) : value;
  }

  /// @dev Return SVG logo in svg format. TODO implement
  function logo(uint _tokenId, uint _balanceOf, uint untilEnd, uint _value) internal pure returns (string memory output) {
    output = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><style>.base{font-size:40px;}</style><rect fill="#193180" width="600" height="900"/><path fill="#4899F8" d="M0,900h600V522.2C454.4,517.2,107.4,456.8,60.2,0H0V900z"/><circle fill="#1B184E" cx="385" cy="212" r="180"/><circle fill="#04A8F0" cx="385" cy="142" r="42"/><path fill-rule="evenodd" clip-rule="evenodd" fill="#686DF1" d="M385.6,208.8c43.1,0,78-34.9,78-78c-1.8-21.1,16.2-21.1,21.1-15.4c0.4,0.3,0.7,0.7,1.1,1.2c16.7,21.5,26.6,48.4,26.6,77.7c0,25.8-24.4,42.2-50.2,42.2H309c-25.8,0-50.2-16.4-50.2-42.2c0-29.3,9.9-56.3,26.6-77.7c0.3-0.4,0.7-0.8,1.1-1.2c4.9-5.7,22.9-5.7,21.1,15.4l0,0C307.6,173.9,342.5,208.8,385.6,208.8z"/><path fill="#04A8F0" d="M372.3,335.9l-35.5-51.2c-7.5-10.8,0.2-25.5,13.3-25.5h35.5h35.5c13.1,0,20.8,14.7,13.3,25.5l-35.5,51.2C392.5,345.2,378.7,345.2,372.3,335.9z"/>';
    output = string(abi.encodePacked(output, '<text transform="matrix(1 0 0 1 50 464)" fill="#EAECFE" class="base">ID:</text><text transform="matrix(1 0 0 1 50 506)" fill="#97D0FF" class="base">', StringLib._toString(_tokenId), '</text>'));
    output = string(abi.encodePacked(output, '<text transform="matrix(1 0 0 1 50 579)" fill="#EAECFE" class="base">Balance:</text><text transform="matrix(1 0 0 1 50 621)" fill="#97D0FF" class="base">', StringLib._toString(_balanceOf / 1e18), '</text>'));
    output = string(abi.encodePacked(output, '<text transform="matrix(1 0 0 1 50 695)" fill="#EAECFE" class="base">Until unlock:</text><text transform="matrix(1 0 0 1 50 737)" fill="#97D0FF" class="base">', StringLib._toString(untilEnd / 60 / 60 / 24), ' days</text>'));
    output = string(abi.encodePacked(output, '<text transform="matrix(1 0 0 1 50 811)" fill="#EAECFE" class="base">Power:</text><text transform="matrix(1 0 0 1 50 853)" fill="#97D0FF" class="base">', StringLib._toString(_value / 1e18), '</text></svg>'));

    string memory json = Base64.encode(bytes(string(abi.encodePacked('{"name": "veTETU #', StringLib._toString(_tokenId), '", "description": "Locked MYRD tokens", "image": "data:image/svg+xml;base64,', Base64.encode(bytes(output)), '"}'))));
    output = string(abi.encodePacked('data:application/json;base64,', json));
  }

}
