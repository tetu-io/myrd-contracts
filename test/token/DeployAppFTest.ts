import {HardhatEthersSigner, SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  IERC20Metadata__factory,
  MockToken, MYRD,
  MYRD__factory,
  Sale,
  Sale__factory,
  TokenFactory,
  TokenFactory__factory,
  Vesting, Vesting__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {formatUnits, parseUnits} from "ethers";
import {expect} from "chai";
import {getDeployedContractByName} from "../../deploy_helpers/deploy-helpers";
import {tokenFactorySol} from "../../typechain/contracts/token";
import {
  DAY,
  SALE_END,
  SALE_PRICE,
  SALE_START, VESTING_PERIOD_REWARDS,
  VESTING_PERIOD_TEAM,
  VESTING_PERIOD_TREASURY
} from "../../deploy_helpers/sale.config";
import { DeployUtils } from "../utils/DeployUtils";

// tslint:disable-next-line:no-var-requires
const hre = require('hardhat');

describe('DeployAppFTest', function() {
  const PRICE = parseUnits("7");
  const DURATION_SECONDS = 60 * 60 * 24 * 7; // 1 week
  const SALE_TOTAL_AMOUNT = parseUnits("4000000");
  const INIT_PAY_AMOUNT = parseUnits("1000000000000000000");
  const MAX_SUPPLY = parseUnits("100000000");

  const TEAM_CLIFF = 182 * DAY;
  const TREASURY_CLIFF = 365 * DAY;
  const REWARDS_CLIFF = 547 * DAY;

  const TEAM_AMOUNT = parseUnits("20000000");
  const TREASURY_AMOUNT = parseUnits("50000000");
  const REWARDS_AMOUNT = parseUnits("20000000");

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let tokenFactory: TokenFactory;
  let gov: HardhatEthersSigner;
  let myrd: MYRD;
  let sale: Sale;
  let vestingContractTeam: Vesting;
  let vestingContractTreasury: Vesting;
  let vestingContractRewards: Vesting;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, governance, user1, user2] = await ethers.getSigners();

    await hre.deployments.fixture([
      "TokenFactory",
      "Vesting",
      "Sale",
      "MYRD",
    ]);

    // ------------------------ get deployed addresses
    const tokenFactoryTemp = TokenFactory__factory.connect(await getDeployedContractByName("TokenFactory", true), user1);
    gov = await DeployUtils.impersonate(await tokenFactoryTemp.governance());
    tokenFactory = TokenFactory__factory.connect(await getDeployedContractByName("TokenFactory", true), gov);
    myrd = MYRD__factory.connect(await tokenFactory.token(), gov);
    sale = Sale__factory.connect(await tokenFactory.saleContract(), gov);
    vestingContractTeam = Vesting__factory.connect(await tokenFactory.vestingContractTeam(), gov);
    vestingContractTreasury = Vesting__factory.connect(await tokenFactory.vestingContractTreasury(), gov);
    vestingContractRewards = Vesting__factory.connect(await tokenFactory.vestingContractRewards(), gov);
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });

  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  describe("Test initial states", () => {
    it("should set expected token factory state", async () => {
      expect(await tokenFactory.cliffStarted()).not.eq(0n);
      expect(await tokenFactory.vestingStarted(vestingContractTeam)).eq(0n);
      expect(await tokenFactory.vestingStarted(vestingContractTreasury)).eq(0n);
      expect(await tokenFactory.vestingStarted(vestingContractRewards)).eq(0n);
    });
    it("should set expected myrd state and myrd balances", async () => {
      expect(await myrd.totalSupply()).eq(parseUnits("6000000") + parseUnits("4000000"));
      expect(await myrd.balanceOf(gov)).eq(parseUnits("6000000"));
      expect(await myrd.balanceOf(sale)).eq(parseUnits("4000000"));
      expect(await myrd.balanceOf(vestingContractTeam)).eq(0); // parseUnits("20000000"));
      expect(await myrd.balanceOf(vestingContractTreasury)).eq(0); // parseUnits("50000000"));
      expect(await myrd.balanceOf(vestingContractRewards)).eq(0); // parseUnits("20000000"));
    });
    it("should set expected sale config", async () => {
      expect((await sale.governance()).toLowerCase()).eq(gov.address.toLowerCase());
      expect(await sale.payToken()).not.eq(ethers.ZeroAddress);

      const payTokenDecimals = 18; // on hardhat

      expect(+formatUnits(await sale.price(), payTokenDecimals)).eq(SALE_PRICE);
      if (hre.network.name !== 'hardhat') {
        expect(await sale.start()).eq(SALE_START);
        expect(await sale.end()).eq(SALE_END);
      }
      expect((await sale.tokenToSale()).toLowerCase()).eq((await myrd.getAddress()).toLowerCase());
      expect(await sale.sold()).eq(0n);
      expect(await sale.bought(user1)).eq(0n);
      expect(await sale.bought(user2)).eq(0n);
      expect(await sale.allowToClaim()).eq(false);
    });
    it("should set expected states of the vesting contracts", async () => {
      expect(await vestingContractTeam.vestingPeriod()).eq(VESTING_PERIOD_TEAM);
      expect(await vestingContractTreasury.vestingPeriod()).eq(VESTING_PERIOD_TREASURY);
      expect(await vestingContractRewards.vestingPeriod()).eq(VESTING_PERIOD_REWARDS);

      expect(await vestingContractTeam.cliffPeriod()).eq(0);
      expect(await vestingContractTreasury.cliffPeriod()).eq(0);
      expect(await vestingContractRewards.cliffPeriod()).eq(0);

      expect(await vestingContractTeam.tgePercent()).eq(0);
      expect(await vestingContractTreasury.tgePercent()).eq(0);
      expect(await vestingContractRewards.tgePercent()).eq(0);

      expect((await vestingContractTeam.token()).toLowerCase()).eq(ethers.ZeroAddress); // (await myrd.getAddress()).toLowerCase());
      expect((await vestingContractTreasury.token()).toLowerCase()).eq(ethers.ZeroAddress); // ((await myrd.getAddress()).toLowerCase());
      expect((await vestingContractRewards.token()).toLowerCase()).eq(ethers.ZeroAddress); // (await myrd.getAddress()).toLowerCase());

      expect(await vestingContractTeam.vestingStartTs()).eq(0);
      expect(await vestingContractTreasury.vestingStartTs()).eq(0);
      expect(await vestingContractRewards.vestingStartTs()).eq(0);
    });

    it("toClaim shouldn't revert", async () => {
      const r = await vestingContractTeam.toClaim(user1);
      expect(r.amount).eq(0n);
      expect(r._lastVestedClaimTs).eq(0n);
      expect(r.extraAmount).eq(0n);
    });
  });

  describe("Start vesting", () => {
    it("should allow to start vesting of team", async() => {
      const claimants = [await user1.getAddress(), await user2.getAddress()];
      const amounts = [1n, TEAM_AMOUNT - 1n];

      await expect(tokenFactory.startTeamVesting(claimants, amounts)).rejectedWith("cliff");
      await TimeUtils.advanceBlocksOnTs(TEAM_CLIFF);

      await expect(tokenFactory.connect(user1).startTeamVesting(claimants, amounts)).rejectedWith("governance");
      await tokenFactory.startTeamVesting(claimants, amounts);
      await expect(tokenFactory.startTeamVesting(claimants, amounts)).rejectedWith("started");

      expect((await vestingContractTeam.token()).toLowerCase()).eq((await myrd.getAddress()).toLowerCase());

      await TimeUtils.advanceBlocksOnTs(VESTING_PERIOD_TEAM);

      await vestingContractTeam.connect(user1).claim();
      await vestingContractTeam.connect(user2).claim();

      expect(await myrd.balanceOf(await user1.getAddress())).eq(1n);
      expect(await myrd.balanceOf(await user2.getAddress())).eq(TEAM_AMOUNT - 1n);
    });

    it("should allow to start vesting of treasury", async() => {
      const claimants = [await user1.getAddress(), await user2.getAddress()];
      const amounts = [1n, TREASURY_AMOUNT - 1n];
      await expect(tokenFactory.startTreasuryVesting(claimants, amounts)).rejectedWith("cliff");

      await TimeUtils.advanceBlocksOnTs(TREASURY_CLIFF);

      await expect(tokenFactory.connect(user1).startTreasuryVesting(claimants, amounts)).rejectedWith("governance");
      await tokenFactory.startTreasuryVesting(claimants, amounts);
      await expect(tokenFactory.startTreasuryVesting(claimants, amounts)).rejectedWith("started");

      expect((await vestingContractTreasury.token()).toLowerCase()).eq((await myrd.getAddress()).toLowerCase());

      await TimeUtils.advanceBlocksOnTs(VESTING_PERIOD_TREASURY);

      await vestingContractTreasury.connect(user1).claim();
      await vestingContractTreasury.connect(user2).claim();

      expect(await myrd.balanceOf(await user1.getAddress())).eq(1n);
      expect(await myrd.balanceOf(await user2.getAddress())).eq(TREASURY_AMOUNT - 1n);
    });

    it("should allow to start vesting of rewards", async() => {
      const claimants = [await user1.getAddress(), await user2.getAddress()];
      const amounts = [1n, REWARDS_AMOUNT - 1n];
      await expect(tokenFactory.startRewardsVesting(claimants, amounts)).rejectedWith("cliff");

      await TimeUtils.advanceBlocksOnTs(REWARDS_CLIFF);

      await expect(tokenFactory.connect(user1).startRewardsVesting(claimants, amounts)).rejectedWith("governance");
      await tokenFactory.startRewardsVesting(claimants, amounts);
      await expect(tokenFactory.startRewardsVesting(claimants, amounts)).rejectedWith("started");

      expect((await vestingContractRewards.token()).toLowerCase()).eq((await myrd.getAddress()).toLowerCase());

      await TimeUtils.advanceBlocksOnTs(VESTING_PERIOD_REWARDS);

      await vestingContractRewards.connect(user1).claim();
      await vestingContractRewards.connect(user2).claim();

      expect(await myrd.balanceOf(await user1.getAddress())).eq(1n);
      expect(await myrd.balanceOf(await user2.getAddress())).eq(REWARDS_AMOUNT - 1n);
    });
  });

  describe("Claim all vesting", () => {
    it("should allow to start all vesting and claim all tokens", async () => {
      const claimants = [await user1.getAddress(), await user2.getAddress()];

      await TimeUtils.advanceBlocksOnTs(TEAM_CLIFF);
      await tokenFactory.startTeamVesting(claimants, [1n, TEAM_AMOUNT - 1n]);

      await TimeUtils.advanceBlocksOnTs(TREASURY_CLIFF);
      await tokenFactory.startTreasuryVesting(claimants, [1n, TREASURY_AMOUNT - 1n]);

      await TimeUtils.advanceBlocksOnTs(REWARDS_CLIFF);
      await tokenFactory.startRewardsVesting(claimants, [1n, REWARDS_AMOUNT - 1n]);

      await TimeUtils.advanceBlocksOnTs(VESTING_PERIOD_REWARDS + VESTING_PERIOD_TEAM + VESTING_PERIOD_TREASURY);

      await vestingContractTeam.connect(user1).claim();
      await vestingContractTeam.connect(user2).claim();
      await vestingContractTreasury.connect(user1).claim();
      await vestingContractTreasury.connect(user2).claim();
      await vestingContractRewards.connect(user1).claim();
      await vestingContractRewards.connect(user2).claim();

      expect(await myrd.balanceOf(await user1.getAddress())).eq(1n + 1n + 1n);
      expect(await myrd.balanceOf(await user2.getAddress())).eq(TREASURY_AMOUNT + TEAM_AMOUNT + REWARDS_AMOUNT - 3n);

      expect(await myrd.balanceOf(await vestingContractTeam.getAddress())).eq(0n);
      expect(await myrd.balanceOf(await vestingContractTreasury.getAddress())).eq(0n);
      expect(await myrd.balanceOf(await vestingContractRewards.getAddress())).eq(0n);
    });
  });

  describe("Try to mint more", () => {
    it("should not allow additional minting", async () => {
      await expect(myrd.connect(user1).mint(user1, 1n)).rejectedWith("minter");

      const minterAsSigner = await DeployUtils.impersonate(await myrd.minter());

      await myrd.connect(minterAsSigner).mint(user1.address, TEAM_AMOUNT);
      await myrd.connect(minterAsSigner).mint(user1.address, TREASURY_AMOUNT);
      await myrd.connect(minterAsSigner).mint(user1.address, REWARDS_AMOUNT);
      expect(await myrd.totalSupply()).eq(MAX_SUPPLY);

      await expect(myrd.connect(minterAsSigner).mint(user1.address, 1n)).rejectedWith("max supply");
    });
  });
});