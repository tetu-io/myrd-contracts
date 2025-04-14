// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./UpgradeableProxy.sol";
import "../interfaces/IControllable.sol";
import "../interfaces/IProxyControlled.sol";

/// @title EIP1967 Upgradable proxy implementation.
/// @dev Only Controller has access and should implement time-lock for upgrade action.
/// @author belbix
contract ProxyControlled is UpgradeableProxy, IProxyControlled {

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant PROXY_CONTROLLED_VERSION = "1.0.0";


  constructor(address _logic) UpgradeableProxy(_logic) {
    //make sure that given logic is controllable
    require(IControllable(_logic).created() >= 0);
  }

  /// @notice Upgrade contract logic
  /// @dev Upgrade allowed only for Controller and should be done only after time-lock period
  /// @param newImplementation_ Implementation address
  function upgrade(address newImplementation_) external override {
    require(IControllable(address(this)).isController(msg.sender), "Proxy: Forbidden");
    IControllable(address(this)).increaseRevision(_implementation());
    _upgradeTo(newImplementation_);
    // the new contract must have the same ABI and you must have the power to change it again
    require(IControllable(address(this)).isController(msg.sender), "Proxy: Wrong implementation");
  }

  /// @notice Return current logic implementation
  function implementation() external override view returns (address) {
    return _implementation();
  }

  /// @dev Fallback function that delegates calls to the address returned by `_implementation()`. Will run if call data
  /// is empty.
  //slither-disable-next-line locked-ether
  receive() external payable virtual {
    _fallback();
  }
}
