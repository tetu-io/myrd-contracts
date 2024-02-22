// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

interface IVeDistributor {

  function claim(uint _tokenId) external returns (uint toClaim);

}
