// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IBVault.sol";
import "../interfaces/IBPT.sol";
import "../interfaces/IWeightedPoolFactory.sol";

contract LiquidityFactory {
    string internal constant NAME = "Balancer Weighted Pool";
    string internal constant SYMBOL = "B-WEIGHTED";
    uint internal constant SWAP_FEE_PERCENTAGE = 25 * 1e14;

    address internal immutable weightedPoolFactory;
    address internal immutable weth;

    mapping(address deployer => address bpt) public deployedBPT;

    constructor(address weightedPoolFactory_, address weth_) {
        weightedPoolFactory = weightedPoolFactory_;
        weth = weth_;
    }

    function deployBPT(address token) external payable {
        IAsset[] memory tokens = new IAsset[](2);
        tokens[0] = IAsset(token);
        tokens[1] = IAsset(weth);
        uint[] memory normalizedWeights = new uint[](2);
        normalizedWeights[0] = 8e17;
        normalizedWeights[1] = 2e17;

        if (tokens[0] > tokens[1]) {
            (tokens[0], tokens[1]) = (tokens[1], tokens[0]);
            (normalizedWeights[0], normalizedWeights[1]) = (normalizedWeights[1], normalizedWeights[0]);
        }

        address bpt = IWeightedPoolFactory(weightedPoolFactory).create(
            NAME,
            SYMBOL,
            tokens,
            normalizedWeights,
            new address[](2),
            SWAP_FEE_PERCENTAGE,
            msg.sender,
            keccak256(abi.encodePacked(msg.sender))
        );

        deployedBPT[msg.sender] = bpt;
    }
}
