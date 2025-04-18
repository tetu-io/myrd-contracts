// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IController {

  function governance() external view returns (address);

  function isDeployer(address adr) external view returns (bool);
}
