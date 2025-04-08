// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../interfaces/IAppErrors.sol";
import "../interfaces/IProxyControlled.sol";
import "../proxy/Controllable.sol";

contract Controller is Controllable, IController {

  //region ------------------------ Constants
  /// @notice Version of the contract
  string public constant override VERSION = "1.0.0";
  bytes32 private constant CONTROLLER_STORAGE_LOCATION = 0x0; // todo myrd.controller
  //endregion ------------------------ Constants

  //region ------------------------ Data types
  /// @custom:storage-location erc7201:myrd.controller
  struct MainStorage {
    address governance;
    mapping(address => bool) deployers;
  }
  //endregion ------------------------ Data types

  //region ------------------------ Events
  event ProxyUpdated(address proxy, address logic);
  //endregion ------------------------ Events

  //region ------------------------ Restrictions

  function onlyGovernance() internal view {
    if (!_isGovernance(msg.sender)) revert IAppErrors.NotGovernance();
  }

  function onlyDeployer() internal view {
    if (!isDeployer(msg.sender)) revert IAppErrors.NotDeployer();
  }
  //endregion ------------------------ Restrictions

  //region ------------------------ Initializer
  function init(address governance_) external initializer {
    __Controllable_init(address(this));
    _S().governance = governance_;
  }
  //endregion ------------------------ Initializer

  //region ------------------------ Views
  function governance() external view override returns (address) {
    return _S().governance;
  }

  function isDeployer(address adr) internal view returns (bool) {
    return _S().deployers[adr] || _isGovernance(adr);
  }
  //endregion ------------------------ Views

  //region ------------------------ Deployer and governance actions

  function updateProxies(address[] memory proxies, address newLogic) external {
    onlyDeployer();

    for (uint i; i < proxies.length; i++) {
      IProxyControlled(proxies[i]).upgrade(newLogic);
      emit ProxyUpdated(proxies[i], newLogic);
    }
  }

  function changeDeployer(bool remove) internal {
    onlyGovernance();

    if (remove) {
      delete _S().deployers[msg.sender];
    } else {
      _S().deployers[msg.sender] = true;
    }
  }
  //endregion ------------------------ Deployer and governance actions

  //region ------------------------ Internal logic
  function _isGovernance(address _value) internal view returns (bool) {
    return _S().governance == _value;
  }

  function _S() internal pure returns (MainStorage storage $) {
    //slither-disable-next-line assembly
    assembly {
      $.slot := CONTROLLER_STORAGE_LOCATION
    }
    return $;
  }
  //endregion ------------------------ Internal logic

}
