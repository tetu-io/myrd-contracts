// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.23;

/// @notice All errors of the app
interface IAppErrors {
  error NotController();
  error NotDeployer();
  error NotGovernance();
  error NotOwner();
  error NotGauge();
  error IncorrectArrayLength();
  error IncorrectZeroArgument();
  error IncorrectZeroAddress();
  error AlreadySet();
}