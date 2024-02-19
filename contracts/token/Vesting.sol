// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract Vesting is ReentrancyGuard {

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
  mapping(address => uint) public lastVestedClaimTs;
  mapping(address => bool) public tgeClaimed;

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

  function start(address _token, uint totalAmount, address[] calldata claimants, uint[] calldata amounts) external {
    require(vestingStartTs == 0, "Already started");
    require(_token != address(0), "Zero address");

    token = IERC20(_token);
    vestingStartTs = block.timestamp + cliffPeriod;

    // todo loop

    IERC20(_token).transferFrom(msg.sender, address(this), totalAmount);

    emit Started(_token, totalAmount, block.timestamp, claimants, amounts);
  }

  function toClaim(address claimant) public view returns (uint amount, uint _lastVestedClaimTs){
    uint _vestingStartTs = vestingStartTs;
    _lastVestedClaimTs = lastVestedClaimTs[claimant];
    _lastVestedClaimTs = _lastVestedClaimTs == 0 ? _vestingStartTs : _lastVestedClaimTs;

    require(_lastVestedClaimTs != 0, "Not started");

    uint vestingTime = _vestingStartTs + vestingPeriod > block.timestamp ? _vestingStartTs + vestingPeriod : block.timestamp;
    uint timeDiff = _lastVestedClaimTs < vestingTime ? vestingTime - _lastVestedClaimTs : 0;

    uint _toDistribute = toDistribute[claimant];
    uint claimableTGE = _toDistribute * tgePercent / 100;
    uint claimableVesting = _toDistribute - claimableTGE;
    claimableTGE = tgeClaimed[claimant] ? 0 : claimableTGE;

    amount = (timeDiff * claimableVesting / vestingPeriod) + claimableTGE;

    uint balance = token.balanceOf(address(this));
    amount = balance < amount ? balance : amount;
  }

  function claim() external nonReentrant {
    (uint _toClaim, uint _lastVestedClaimTs) = toClaim(msg.sender);

    require(_toClaim != 0, "Nothing to claim");

    // if vesting started need to update last claim timestamp
    if (_lastVestedClaimTs < block.timestamp) {
      lastVestedClaimTs[msg.sender] = block.timestamp;
    }

    // assume that any claim will mark TGE as claimed
    if(!tgeClaimed[msg.sender]) {
      tgeClaimed[msg.sender] = true;
    }

    token.transfer(msg.sender, _toClaim);

    emit Claimed(msg.sender, _toClaim);
  }


}
