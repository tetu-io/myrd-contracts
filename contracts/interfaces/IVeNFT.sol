// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

interface IVeNFT is IERC721Enumerable {

  // *************************************************************
  //                        STRUCTS
  // *************************************************************

  struct Point {
    int128 bias;
    int128 slope; // # -dweight / dt
    uint ts;
    uint blk; // block
  }

  // *************************************************************
  //                        MAIN STATE
  // *************************************************************

  /// @custom:storage-location erc7201:venft.main
  struct VeNFTState {

    /// @dev Underlying tokens info
    address[] tokens;
    /// @dev token => weight
    mapping(address => uint) tokenWeights;
    /// @dev token => is allowed for deposits
    mapping(address => bool) isValidToken;
    /// @dev Current count of token
    uint tokenId;
    /// @dev veId => stakingToken => Locked amount
    mapping(uint => mapping(address => uint)) lockedAmounts;
    /// @dev veId => Amount based on weights aka power
    mapping(uint => uint) lockedDerivedAmount;
    /// @dev veId => Lock end timestamp
    mapping(uint => uint) _lockedEndReal;

    // --- CHECKPOINTS LOGIC

    /// @dev Epoch counter. Update each week.
    uint epoch;
    /// @dev epoch -> unsigned point
    mapping(uint => Point) _pointHistory;
    /// @dev user -> Point[userEpoch]
    mapping(uint => Point[1000000000]) _userPointHistory;
    /// @dev veId -> Personal epoch counter
    mapping(uint => uint) userPointEpoch;
    /// @dev time -> signed slope change
    mapping(uint => int128) slopeChanges;

    // --- OTHER
    /// @dev Indicates that this position is always have max lock period.
    mapping(uint => bool) isAlwaysMaxLock;
    /// @dev Total supply from positions with always max lock that added to the current total supply calculated dynamically.
    uint additionalTotalSupply;

  }

  function lockedAmounts(uint veId, address stakingToken) external view returns (uint);

  function lockedDerivedAmount(uint veId) external view returns (uint);

  function lockedEnd(uint veId) external view returns (uint);

  function tokens(uint idx) external view returns (address);

  function balanceOfNFT(uint) external view returns (uint);

  function balanceOfNFTAt(uint _tokenId, uint _t) external view returns (uint);

  function isApprovedOrOwner(address, uint) external view returns (bool);

  function userPointEpoch(uint tokenId) external view returns (uint);

  function epoch() external view returns (uint);

  function userPointHistory(uint tokenId, uint loc) external view returns (Point memory);

  function pointHistory(uint loc) external view returns (Point memory);

  function checkpoint() external;

  function totalSupplyAt(uint _block) external view returns (uint);

  function totalSupplyAtT(uint timestamp) external view returns (uint);

  // ---

  function createLockFor(address _token, uint _value, uint _lockDuration, address _to, bool alwaysMaxLock) external returns (uint);

  function increaseAmount(address _token, uint _tokenId, uint _value) external;
}
