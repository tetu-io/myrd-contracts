// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Controller} from "../../core/Controller.sol";

/// @dev This contract is used to test the upgradeability of the Controller contract.
contract ControllerToUpgrade is Controller {
  string public constant NEW_CONSTANT = "1";
}