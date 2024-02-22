// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "./Vesting.sol";
import "../interfaces/IVeNFT.sol";
import "../interfaces/IVeDistributor.sol";
import "../interfaces/IBVault.sol";
import "../interfaces/IBPT.sol";

/// @title Vesting contract for token distribution and locking forever in veNFT.
contract VestingLocked is Vesting {

  /// @dev veNFT for locking claimed tokens.
  IVeNFT public ve;

  /// @dev Created veNFT IDs during claiming process.
  mapping(address => uint) public veIds;

  //////////////////////////////

  constructor(uint _vestingPeriod, uint _cliffPeriod, uint _tgePercent) Vesting(_vestingPeriod, _cliffPeriod, _tgePercent) {
    // noop
  }

  //////////////////////////////

  function _transferClaimedTokens(IERC20 _token, uint amount, address claimant) internal override returns (uint notClaimed) {
    uint existId = veIds[claimant];

    (uint notUsedAmount, IBPT underlying, uint bptAmount) = _createBpt(_token, amount, claimant);
    notClaimed = notUsedAmount;

    _approveIfNeeds(address(underlying), bptAmount, address(ve));

    if (existId != 0) {
      ve.increaseAmount(address(underlying), existId, bptAmount);
    } else {
      veIds[claimant] = ve.createLockFor(address(underlying), bptAmount, ve.maxLock(), claimant, true);
    }

  }

  struct CreateBptContext {
    IBVault vault;
    bytes32 poolId;
    IERC20[] tokens;
    uint[] balances;
    uint tokenAIndex;
    uint tokenBIndex;
    uint tokenANeed;
    uint tokenBNeed;
    uint tokenBClaimantBalance;
  }

  function _createBpt(IERC20 tokenA, uint amount, address claimant) internal returns (uint notUsedAmount, IBPT underlying, uint bptAmount) {
    CreateBptContext memory c;
    underlying = IBPT(ve.tokens(0));
    c.vault = IBVault(underlying.getVault());
    c.poolId = underlying.getPoolId();

    (
      c.tokens,
      c.balances,
    ) = c.vault.getPoolTokens(c.poolId);

    for (uint i = 0; i < c.tokens.length; i++) {
      if (address(c.tokens[i]) == address(underlying)) {
        continue;
      }
      if (address(c.tokens[i]) == address(tokenA)) {
        c.tokenAIndex = i;
      } else {
        // assume only 3 tokens in the array
        c.tokenBIndex = i;
      }
    }

    // assume both tokens has 18 decimals
    c.tokenBNeed = c.balances[c.tokenBIndex] * amount / c.balances[c.tokenAIndex];
    c.tokenBClaimantBalance = c.tokens[c.tokenBIndex].balanceOf(claimant);
    c.tokenBNeed = c.tokenBNeed > c.tokenBClaimantBalance ? c.tokenBClaimantBalance : c.tokenBNeed;

    c.tokenANeed = c.balances[c.tokenAIndex] * c.tokenBNeed / c.balances[c.tokenBIndex];
    c.tokenANeed = c.tokenANeed > amount ? amount : c.tokenANeed;

    notUsedAmount = amount - c.tokenANeed;

    // claimant should provide necessary amount of tokenB to claim tokenA and lock it.
    c.tokens[c.tokenBIndex].transferFrom(claimant, address(this), c.tokenBNeed);

    _balancerJoin(
      c.vault,
      c.tokens,
      c.poolId,
      address(tokenA),
      address(c.tokens[c.tokenBIndex]),
      c.tokenANeed,
      c.tokenBNeed
    );

    bptAmount = IERC20(address(underlying)).balanceOf(address(this));
  }

  function _balancerJoin(
    IBVault vault,
    IERC20[] memory _poolTokens,
    bytes32 _poolId,
    address tokenA,
    address tokenB,
    uint amountA,
    uint amountB
  ) internal {
    uint len = _poolTokens.length;
    uint[] memory amounts = new uint[](len);
    for (uint i; i < len; ++i) {
      if (address(_poolTokens[i]) == tokenA) {
        amounts[i] = amountA;
      }
      if (address(_poolTokens[i]) == tokenB) {
        amounts[i] = amountB;
      }
    }

    IAsset[] memory assets = new IAsset[](len);
    for (uint i = 0; i < len; i++) {
      assets[i] = IAsset(address(_poolTokens[i]));
    }

    bytes memory userData = abi.encode(1, amounts, 1);
    IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
      assets: assets,
      maxAmountsIn: amounts,
      userData: userData,
      fromInternalBalance: false
    });

    _approveIfNeeds(tokenA, amountA, address(vault));
    _approveIfNeeds(tokenB, amountB, address(vault));

    vault.joinPool(_poolId, address(this), address(this), request);
  }

  function _approveIfNeeds(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).approve(spender, type(uint).max);
    }
  }

}
