// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../interfaces/IAppErrors.sol";
import "../interfaces/IProxyControlled.sol";

library ControllerLib {
  /// @dev keccak256(abi.encode(uint256(keccak256("erc7201:myrd.Controller")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 internal constant CONTROLLER_STORAGE_LOCATION = 0x4c6450c977215891cc3be3fa519a5e16bed895db738a774c07512a1e9245d300; // erc7201:myrd.Controller

  /// @custom:storage-location erc7201:myrd.Controller
  struct MainStorage {
    address governance;
    mapping(address => bool) deployers;
  }

  function init(address governance_) internal {
    _S().governance = governance_;
  }

  //region ------------------------ Restrictions
  function onlyGovernance() internal view {
      if (!_isGovernance(msg.sender)) revert IAppErrors.NotGovernance();
  }

  function onlyDeployer() internal view {
    if (!isDeployer(msg.sender)) revert IAppErrors.NotDeployer();
  }

  function _isGovernance(address _value) internal view returns (bool) {
    return _S().governance == _value;
  }

  function isDeployer(address adr) internal view returns (bool) {
    return _S().deployers[adr] || _isGovernance(adr);
  }
  //endregion ------------------------ Restrictions

  //region ------------------------ Logic
  function governance() internal view returns (address) {
    return _S().governance;
  }

  function updateProxies(address[] memory proxies, address newLogic) internal {
    onlyDeployer();

    for (uint i; i < proxies.length; i++) {
      IProxyControlled(proxies[i]).upgrade(newLogic);
    }
  }

  function changeDeployer(address adr, bool remove) internal {
    onlyGovernance();

    if (remove) {
      delete _S().deployers[adr];
    } else {
      _S().deployers[adr] = true;
    }
  }
  //endregion ------------------------ Logic

  //region ------------------------ Internal logic
  function _S() internal pure returns (MainStorage storage $) {
    assembly {
      $.slot := CONTROLLER_STORAGE_LOCATION
    }
    return $;
  }
  //endregion ------------------------ Internal logic
}