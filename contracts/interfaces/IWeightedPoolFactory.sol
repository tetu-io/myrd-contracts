// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "./IBVault.sol";

interface IWeightedPoolFactory {
  event PoolCreated(address indexed pool);

  /**
     * @dev Deploys a new `WeightedPool`.
     */
  function create(
    string memory name,
    string memory symbol,
    IAsset[] memory tokens,
    uint[] memory normalizedWeights,
    address[] memory rateProviders,
    uint swapFeePercentage,
    address owner,
    bytes32 salt
  ) external returns (address);

  function getVault() external view returns (address);
}
