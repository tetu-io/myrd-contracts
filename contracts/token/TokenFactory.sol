// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../interfaces/IVesting.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TokenFactory {

  uint private constant INITIAL_LIQUIDITY = 1_000_000e18;
  uint private constant TREASURY = 35_000_000e18;
  uint private constant TETU = 20_000_000e18;
  uint private constant AMBASSADORS = 4_000_000e18;
  uint private constant FUNDRAISE_SEED = 10_000_000e18;
  uint private constant FUNDRAISE_PRIVATE = 10_000_000e18;
  uint private constant TEAM = 20_000_000e18;

  address public token;

  function computeAddress(bytes32 salt, bytes memory bytecode) external view returns (address) {
    return Create2.computeAddress(salt, keccak256(bytecode), address(this));
  }

  /// @dev vestingContracts array:
  /// 0 - Treasury 35%
  /// 1 - Tetu 20%
  /// 2 - Ambassadors 4%
  /// 3 - Fundraise (Seed) 10%
  /// 4 - Fundraise (Private) 10%
  /// 5 - Team 20%
  function createToken(
    bytes32 salt,
    bytes memory bytecode,
    address[] memory vestingContracts,
    address[][] memory claimants,
    uint[][] memory amounts
  ) external {
    require(token == address(0), 'created');
    require(vestingContracts.length == 6 && claimants.length == 6 && amounts.length == 6, "length");

    IERC20 _token = IERC20(Create2.deploy(0, salt, bytecode));

    // Initial Liquidity 1%, just send to EOA
    _token.transfer(msg.sender, INITIAL_LIQUIDITY);

    // --- Treasury 35%
    _token.transfer(vestingContracts[0], TREASURY);
    IVesting(vestingContracts[0]).start(true, address(_token), TREASURY, claimants[0], amounts[0]);

    // Tetu 20%
    _token.transfer(vestingContracts[1], TETU);
    IVesting(vestingContracts[1]).start(true, address(_token), TETU, claimants[1], amounts[1]);

    // Ambassadors 4%
    _token.transfer(vestingContracts[2], AMBASSADORS);
    IVesting(vestingContracts[2]).start(true, address(_token), AMBASSADORS, claimants[2], amounts[2]);

    // Fundraise (Seed) 10%
    _token.transfer(vestingContracts[3], FUNDRAISE_SEED);
    IVesting(vestingContracts[3]).start(true, address(_token), FUNDRAISE_SEED, claimants[3], amounts[3]);

    // Fundraise (Private) 10%
    _token.transfer(vestingContracts[4], FUNDRAISE_PRIVATE);
    IVesting(vestingContracts[4]).start(true, address(_token), FUNDRAISE_PRIVATE, claimants[4], amounts[4]);

    // Team 20%
    _token.transfer(vestingContracts[5], TEAM);
    IVesting(vestingContracts[5]).start(true, address(_token), TEAM, claimants[5], amounts[5]);

    require(_token.totalSupply() == 100_000_000e18, "total");

    token = address(_token);
  }

}
