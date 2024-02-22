// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

/// @dev lite version of BPT token
interface IBPT {
  function getNormalizedWeights() external view returns (uint256[] memory);

  function getVault() external view returns (address);

  function getPoolId() external view returns (bytes32);

  function totalSupply() external view returns (uint256);

  function symbol() external view returns (string memory);
}
