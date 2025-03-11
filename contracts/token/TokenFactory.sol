// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../interfaces/IVesting.sol";
import "../interfaces/ISale.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMYRD is IERC20 {
  function minter() external view returns (address);

  function mint(address to, uint256 amount) external;
}

contract TokenFactory {

  // ********************** TOKENOMICS **********************

  uint private constant PUBLIC_SALE_AMOUNT = 4_000_000e18;
//  uint private constant PUBLIC_SALE_CLIFF = 0;
//  uint private constant PUBLIC_SALE_VESTING = 0;

  uint private constant LIQUIDITY_AMOUNT = 6_000_000e18;
//  uint private constant LIQUIDITY_CLIFF = 0;
//  uint private constant LIQUIDITY_VESTING = 0;

  uint private constant TEAM_AMOUNT = 20_000_000e18;
  uint private constant TEAM_CLIFF = 182 days;
  uint private constant TEAM_VESTING = 1277 days;

  uint private constant TREASURY_AMOUNT = 50_000_000e18;
  uint private constant TREASURY_CLIFF = 365 days;
  uint private constant TREASURY_VESTING = 1095 days;

  uint private constant REWARDS_AMOUNT = 20_000_000e18;
  uint private constant REWARDS_CLIFF = 547 days;
  uint private constant REWARDS_VESTING = 912 days;

  // ********************** VARIABLES **********************

  address public governance;
  IMYRD public token;
  address public saleContract;
  uint public cliffStarted;
  IVesting public vestingContractTeam;
  IVesting public vestingContractTreasury;
  IVesting public vestingContractRewards;
  // vesting contract => start block. Zero means not started yet.
  mapping(address => uint) public vestingStarted;

  function computeAddress(bytes32 salt, bytes memory bytecode) external view returns (address) {
    return Create2.computeAddress(salt, keccak256(bytecode), address(this));
  }

  // need to pass immutable deployed vesting contracts to be sure that final total supply is correct
  function createToken(
    bytes32 salt,
    bytes memory bytecode,
    address _governance,
    address _saleContract,
    address _vestingContractTeam,
    address _vestingContractTreasury,
    address _vestingContractRewards
  ) external {
    require(
      address(token) == address(0)
      && governance == address(0)
      && address(vestingContractTeam) == address(0)
      && address(vestingContractTreasury) == address(0)
      && address(vestingContractRewards) == address(0)
      , 'created');
    require(
      _governance != address(0)
      && _vestingContractTeam != address(0)
      && _vestingContractTreasury != address(0)
      && _vestingContractRewards != address(0)
      , "empty");

    IMYRD _token = IMYRD(Create2.deploy(0, salt, bytecode));

    governance = _governance;
    token = _token;
    saleContract = _saleContract;
    cliffStarted = block.timestamp;

    vestingContractTeam = IVesting(_vestingContractTeam);
    require(IVesting(_vestingContractTeam).vestingPeriod() == TEAM_VESTING, 'team wrong vesting');
    require(IVesting(_vestingContractTeam).cliffPeriod() == 0, 'team wrong cliff');
    require(IVesting(_vestingContractTeam).tgePercent() == 0, 'team wrong tge');

    vestingContractTreasury = IVesting(_vestingContractTreasury);
    require(IVesting(_vestingContractTreasury).vestingPeriod() == TREASURY_VESTING, 'treasury wrong vesting');
    require(IVesting(_vestingContractTreasury).cliffPeriod() == 0, 'treasury wrong cliff');
    require(IVesting(_vestingContractTreasury).tgePercent() == 0, 'treasury wrong tge');

    vestingContractRewards = IVesting(_vestingContractRewards);
    require(IVesting(_vestingContractRewards).vestingPeriod() == REWARDS_VESTING, 'rewards wrong vesting');
    require(IVesting(_vestingContractRewards).cliffPeriod() == 0, 'rewards wrong cliff');
    require(IVesting(_vestingContractRewards).tgePercent() == 0, 'rewards wrong tge');

    require(_token.totalSupply() == 0, "wrong total supply");
    require(_token.minter() == address(this), "wrong gov");

    _token.mint(_saleContract, PUBLIC_SALE_AMOUNT);
    _token.mint(_governance, LIQUIDITY_AMOUNT);

    ISale(_saleContract).setupTokenToSale(address(_token));
  }

  function startTeamVesting(address[] calldata claimants, uint[] calldata amounts) external {
    _startVesting(vestingContractTeam, TEAM_CLIFF, TEAM_AMOUNT, claimants, amounts);
  }

  function startTreasuryVesting(address[] calldata claimants, uint[] calldata amounts) external {
    _startVesting(vestingContractTreasury, TREASURY_CLIFF, TREASURY_AMOUNT, claimants, amounts);
  }

  function startRewardsVesting(address[] calldata claimants, uint[] calldata amounts) external {
    _startVesting(vestingContractRewards, REWARDS_CLIFF, REWARDS_AMOUNT, claimants, amounts);
  }

  function _startVesting(
    IVesting vestingContract,
    uint cliff,
    uint totalAmount,
    address[] calldata claimants,
    uint[] calldata amounts
  ) internal {
    require(msg.sender == governance, "governance");
    require(vestingStarted[address(vestingContract)] == 0, "started");
    require(block.timestamp >= cliffStarted + cliff, "cliff");

    vestingStarted[address(vestingContract)] = block.number;

    IMYRD _token = IMYRD(token);

    _token.mint(address(vestingContract), totalAmount);

    IVesting(vestingContract).start(
      true,
      address(_token),
      totalAmount,
      claimants,
      amounts
    );
  }

}
