// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.23;

import "../../interfaces/IAppErrors.sol";
import "../../lib/ControllerLib.sol";

/// @notice Special contract to keep all Storage-related utils (and so to reduce sizes of the facade contracts on ~300 kb)
contract StorageLocationChecker is IAppErrors {

  function getStorageLocation(string memory storageName) external pure returns(bytes32) {
    return keccak256(abi.encode(uint256(keccak256(bytes(storageName))) - 1)) & ~bytes32(uint256(0xff));
  }

  function getControllerStorageLocation() external pure returns(bytes32) {
    return keccak256(abi.encode(uint256(keccak256("myrd.controller")) - 1)) & ~bytes32(uint256(0xff));
  }

  function getControllerLibStorage() external pure returns(bytes32 storageName) {
    return ControllerLib.CONTROLLER_STORAGE_LOCATION;
  }

}