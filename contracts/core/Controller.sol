// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../interfaces/IAppErrors.sol";
import "../interfaces/IProxyControlled.sol";
import "../lib/ControllerLib.sol";
import "../proxy/Controllable.sol";

contract Controller is Controllable, IController {
  string public constant VERSION = "1.0.0";

  function init(address governance_) external initializer {
    ControllerLib.init(governance_);
  }

  function governance() external view returns (address) {
    return ControllerLib.governance();
  }

  function isDeployer(address adr) external view returns (bool) {
    return ControllerLib.isDeployer(adr);
  }

  function updateProxies(address[] memory proxies, address newLogic) external {
    ControllerLib.updateProxies(proxies, newLogic);
  }

  function changeDeployer(bool remove) external {
    ControllerLib.changeDeployer(remove);
  }
}