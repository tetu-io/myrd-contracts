import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory, IController__factory,
  MockGauge,
  MockGauge__factory,
  MockToken,
  MultiGauge,
  MultiGauge__factory,
  MYRD,
  MYRD__factory, Sale__factory,
  StorageLocationChecker,
  StorageLocationChecker__factory, TokenFactory, TokenFactory__factory, Vesting__factory,
  XMyrd,
  XMyrd__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import hre, {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {expect} from "chai";
import {Deploy} from "../../scripts/deploy/Deploy";
import {formatUnits, parseUnits} from "ethers";
import {getDeployedContractByName} from "../../deploy_helpers/deploy-helpers";
import {DeployUtils} from "../utils/DeployUtils";
import {Misc} from "../../scripts/Misc";
import {sign} from "node:crypto";

describe('MultiGaugeFTest', function() {
  let snapshotBefore: string;
  let snapshot: string;

  let deployer: Deploy;

  let signer: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let deployerInController: SignerWithAddress;

  let controller: Controller;
  let xmyrd: XMyrd;
  let myrd: MYRD;
  let gauge: MultiGauge;
  let wethMock: MockToken;
  let usdcMock: MockToken;
  let tokenFactory: TokenFactory;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, user1, user2, user3, user4, deployerInController] = await ethers.getSigners();


    await hre.deployments.fixture([
      "AllCoreProxies",
      "TokenFactory",
      "Vesting",
      "Sale",
      "MYRD",
    ]);

    // ------------------------ get deployed addresses
    const tokenFactoryTemp = TokenFactory__factory.connect(await getDeployedContractByName("TokenFactory", true), user1);
    governance = await DeployUtils.impersonate(await tokenFactoryTemp.governance());
    tokenFactory = TokenFactory__factory.connect(await getDeployedContractByName("TokenFactory", true), governance);
    myrd = MYRD__factory.connect(await tokenFactory.token(), governance);

    controller = Controller__factory.connect(await getDeployedContractByName("ControllerProxy", true), governance);
    xmyrd = XMyrd__factory.connect(await getDeployedContractByName("XMyrdProxy", true), governance);
    gauge = MultiGauge__factory.connect(await getDeployedContractByName("MultiGaugeProxy", true), governance);

    usdcMock = await DeployerUtils.deployMockToken(signer, 'USDC', 6, false);
    wethMock = await DeployerUtils.deployMockToken(signer, 'WETH', 18, false);

    await controller.connect(governance).changeDeployer(deployerInController, false);
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

  describe("Check initialization of deployed proxy contracts", () => {
    it("should return expected values", async () => {
      expect((await controller.governance()).toLowerCase()).eq(governance.address.toLowerCase());

      expect((await gauge.controller()).toLowerCase()).eq((await controller.getAddress()).toLowerCase());
      expect((await gauge.xMyrd()).toLowerCase()).eq((await xmyrd.getAddress()).toLowerCase());

      expect((await xmyrd.controller()).toLowerCase()).eq((await controller.getAddress()).toLowerCase());
      expect((await xmyrd.gauge()).toLowerCase()).eq((await gauge.getAddress()).toLowerCase());
      expect((await xmyrd.myrd()).toLowerCase()).eq((await tokenFactory.token()).toLowerCase());
    });
  });

  describe("Uses cases", () => {
    describe("Myrd is only reward token", () => {
      it("Users 1 and 2 use instant exit, users 3 and 4 earn penalties", async () => {
        // ------------ update period (no users)
        await gauge.connect(governance).updatePeriod(0n);

        // ------------ provide MYRD to users 1-4
        const AMOUNT_1 = parseUnits("20000");
        const AMOUNT_1_ENTER_1 = parseUnits("10000");
        const AMOUNT_1_ENTER_2 = parseUnits("4000");
        const AMOUNT_2 = parseUnits("2000");
        const AMOUNT_3 = parseUnits("3000");

        const AMOUNT_4 = parseUnits("500");

        await myrd.connect(governance).transfer(user1, AMOUNT_1);
        await myrd.connect(governance).transfer(user2, AMOUNT_2);
        await myrd.connect(governance).transfer(user3, AMOUNT_3);
        await myrd.connect(governance).transfer(user4, AMOUNT_4);

        await myrd.connect(user1).approve(xmyrd, Misc.MAX_UINT);
        await myrd.connect(user2).approve(xmyrd,  Misc.MAX_UINT);
        await myrd.connect(user3).approve(xmyrd,  Misc.MAX_UINT);
        await myrd.connect(user4).approve(xmyrd,  Misc.MAX_UINT);

        // ------------ enter
        await xmyrd.connect(user1).enter(AMOUNT_1_ENTER_1);
        await xmyrd.connect(user1).enter(AMOUNT_1_ENTER_2);

        await xmyrd.connect(user2).enter(AMOUNT_2);

        await xmyrd.connect(user3).enter(AMOUNT_3);

        await xmyrd.connect(user4).enter(AMOUNT_4);

        // ------------ user1: create 3 vests, cancel 2 of them and use instant exit instead
        const VEST_10 = parseUnits("1000");
        const VEST_11 = parseUnits("5000");
        const VEST_12 = AMOUNT_1_ENTER_1 + AMOUNT_1_ENTER_2 - VEST_10 - VEST_11;

        const EXIT_11 = parseUnits("1000");
        const EXIT_12 = VEST_11 + VEST_12 - EXIT_11;

        await xmyrd.connect(user1).createVest(VEST_10);
        await xmyrd.connect(user1).createVest(VEST_11);
        await xmyrd.connect(user1).createVest(VEST_12);

        await TimeUtils.advanceBlocksOnTs(13*24*60*60);
        await xmyrd.connect(user1).exitVest(1); // VEST_11
        await xmyrd.connect(user1).exitVest(2); // VEST_12

        await xmyrd.connect(user1).exit(EXIT_11);
        await xmyrd.connect(user1).exit(EXIT_12);

        const expectedPenalty1 = (EXIT_11 + EXIT_12) / 2n; // 6000
        expect(await xmyrd.pendingRebase()).eq(expectedPenalty1);

        // ------------ users 3 - create a vest for half amount
        await xmyrd.connect(user3).createVest(AMOUNT_3 / 2n);
        await TimeUtils.advanceBlocksOnTs(90*24*60*60);

        // ------------ user2: instant exit
        const EXIT_21 = parseUnits("500");
        const EXIT_22 = AMOUNT_2 - EXIT_21;
        await xmyrd.connect(user2).exit(EXIT_21);
        await xmyrd.connect(user2).exit(EXIT_22);

        const expectedPenalty2 = (EXIT_21 + EXIT_22) / 2n; // 1000
        expect(await xmyrd.pendingRebase()).eq(expectedPenalty1 + expectedPenalty2); // 7000

        // ------------ check balances
        expect(await xmyrd.balanceOf(user1)).eq(0n);
        expect(await xmyrd.balanceOf(user2)).eq(0n);
        expect(await xmyrd.balanceOf(user3)).eq(AMOUNT_3 / 2n, "half of the amount is vested and so don't earn penalties");
        expect(await xmyrd.balanceOf(user4)).eq(AMOUNT_4, "full amount - the user has no vesting");

        expect(await myrd.balanceOf(user1)).eq(
          AMOUNT_1 - AMOUNT_1_ENTER_1 - AMOUNT_1_ENTER_2 // not entered
          + (EXIT_11 + EXIT_12) / 2n // exit amount without penalty
        );
        expect(await myrd.balanceOf(user2)).eq(
          (EXIT_21 + EXIT_22) / 2n
        );
        expect(await myrd.balanceOf(user3)).eq(0n);
        expect(await myrd.balanceOf(user4)).eq(0n);

        // ------------ update period, start to distribute [penalties + additional rewards]
        const ADDITIONAL_REWARD = parseUnits("3000");
        await myrd.connect(governance).approve(gauge, ADDITIONAL_REWARD);
        await gauge.connect(governance).updatePeriod(ADDITIONAL_REWARD);

        await TimeUtils.advanceBlocksOnTs(7*24*60*60 * 2 / 5); // wait 2/5 of the week
        await gauge.connect(user1).getAllRewards(user1);

        await TimeUtils.advanceBlocksOnTs(7*24*60*60 * 3 / 5); // wait 3/5 of the week (1 week in total)
        await gauge.connect(user1).getAllRewards(user1);
        await gauge.connect(user2).getAllRewards(user2);
        await gauge.connect(user3).getAllRewards(user3);
        await gauge.connect(user4).getReward(user4, [myrd]);

        // ------------ check balances
        expect(await myrd.balanceOf(user1)).eq(
          AMOUNT_1 - AMOUNT_1_ENTER_1 - AMOUNT_1_ENTER_2 // not entered
          + (EXIT_11 + EXIT_12) / 2n // exit amount without penalty
        );
        expect(await myrd.balanceOf(user2)).eq(
          (EXIT_21 + EXIT_22) / 2n //
        );
        expect(await myrd.balanceOf(user3)).approximately(
          (ADDITIONAL_REWARD + expectedPenalty1 + expectedPenalty2) * (AMOUNT_3 / 2n) / (AMOUNT_3 / 2n + AMOUNT_4),
          1
        );
        expect(await myrd.balanceOf(user4)).approximately(
          (ADDITIONAL_REWARD + expectedPenalty1 + expectedPenalty2) * (AMOUNT_4) / (AMOUNT_3 / 2n + AMOUNT_4),
          1
        );

        // ------------ check vesting
        expect((await xmyrd.vestInfo(user1, 0)).amount).eq(VEST_10);
        expect((await xmyrd.vestInfo(user1, 1)).amount).eq(0n);
        expect((await xmyrd.vestInfo(user1, 2)).amount).eq(0n);
      });

      it("No users to earn penalties in the period", async () => {
        // ------------ update period (no users)
        await gauge.connect(governance).updatePeriod(0n);

        // ------------ provide MYRD to users 1-4
        const AMOUNT_1 = parseUnits("20000");
        const AMOUNT_2 = parseUnits("2000");

        await myrd.connect(governance).transfer(user1, AMOUNT_1);
        await myrd.connect(governance).transfer(user2, AMOUNT_2);

        await myrd.connect(user1).approve(xmyrd, Misc.MAX_UINT);
        await myrd.connect(user2).approve(xmyrd,  Misc.MAX_UINT);

        // ------------ enter and exit with penalties
        await xmyrd.connect(user1).enter(AMOUNT_1);
        await xmyrd.connect(user1).exit(AMOUNT_1);

        // ------------ go to next period
        await TimeUtils.advanceBlocksOnTs(7*24*60*60);

        await gauge.connect(governance).updatePeriod(0n);
        await TimeUtils.advanceBlocksOnTs(7*24*60*60);
        expect(await xmyrd.pendingRebase()).eq(0n);

        await TimeUtils.advanceBlocksOnTs(7*24*60*60);
        await xmyrd.connect(user2).enter(AMOUNT_2);

        await TimeUtils.advanceBlocksOnTs(7*24*60*60);
        await gauge.connect(user1).getAllRewards(user1);
        await gauge.connect(user2).getAllRewards(user2);

        expect(await myrd.balanceOf(user2)).eq(0n);
        expect(await myrd.balanceOf(gauge)).eq(AMOUNT_1 / 2n, "reward hangs on balance of the gauge forever");
      });

      it("Multiple users, periods", async () => {
        const WEEK = 7*24*60*60;
        const DAY = 24*60*60;

        const ADDITIONAL_REWARD_MYRD_1 = parseUnits("100");
        const ADDITIONAL_REWARD_MYRD_2 = parseUnits("500");

        // ------------ update period (no users)
        await gauge.connect(governance).updatePeriod(0n);

        // ------------ provide MYRD to users 1-4
        const AMOUNT_1 = parseUnits("20000"); // user 1: instant exit
        const AMOUNT_2 = parseUnits("2000");  // user 2: vesting with penalty
        const AMOUNT_3 = parseUnits("2000");  // user 3: collect 2/5 rewards, claim rewards regularly
        const AMOUNT_4 = parseUnits("3000");  // user 4: collect 3/5 rewards, claim all rewards at the end

        await myrd.connect(governance).transfer(user1, AMOUNT_1);
        await myrd.connect(governance).transfer(user2, AMOUNT_2);
        await myrd.connect(governance).transfer(user3, AMOUNT_3);
        await myrd.connect(governance).transfer(user4, AMOUNT_4);

        await myrd.connect(user1).approve(xmyrd, Misc.MAX_UINT);
        await myrd.connect(user2).approve(xmyrd, Misc.MAX_UINT);
        await myrd.connect(user3).approve(xmyrd, Misc.MAX_UINT);
        await myrd.connect(user4).approve(xmyrd, Misc.MAX_UINT);

        await myrd.connect(governance).approve(gauge, Misc.MAX_UINT);

        // ------------ enter
        await xmyrd.connect(user1).enter(AMOUNT_1);
        await xmyrd.connect(user2).enter(AMOUNT_2);
        await xmyrd.connect(user3).enter(AMOUNT_3);
        await xmyrd.connect(user4).enter(AMOUNT_4);
        expect(await gauge.totalSupply(xmyrd)).eq(AMOUNT_1 + AMOUNT_2 + AMOUNT_3 + AMOUNT_4);

        // ------------ period 1
        await TimeUtils.advanceBlocksOnTs(WEEK);
        await gauge.connect(governance).updatePeriod(0n); // no penalties

        // ------------ user1 and user 2 exit
        await TimeUtils.advanceBlocksOnTs(DAY);

        const PENALTY_1 = AMOUNT_1 / 2n;
        await xmyrd.connect(user1).exit(AMOUNT_1); // instant exit
        await xmyrd.connect(user2).createVest(AMOUNT_2); // exit with vesting
        expect(await xmyrd.pendingRebase()).eq(PENALTY_1);
        expect(await gauge.totalSupply(xmyrd)).eq(AMOUNT_3 + AMOUNT_4);

        // ------------ period 2
        await TimeUtils.advanceBlocksOnTs(WEEK);
        await gauge.connect(governance).updatePeriod(ADDITIONAL_REWARD_MYRD_1);
        expect(await xmyrd.pendingRebase()).eq(0n);

        // ------------ period 3
        await TimeUtils.advanceBlocksOnTs(WEEK);

        // ----------- user3 claims
        await gauge.connect(user3).getAllRewards(user3);
        expect(await myrd.balanceOf(user3)).approximately(
          (ADDITIONAL_REWARD_MYRD_1 + PENALTY_1) * AMOUNT_3 / (AMOUNT_3 + AMOUNT_4),
          1n
        );

        // ------------ user2 waits half of vesting period and exit with penalty
        const vestInfo2 = await xmyrd.vestInfo(user2, 0);
        const now = (await ethers.provider.getBlock("latest"))?.timestamp ?? 0;

        await TimeUtils.advanceBlocksOnTs(
          Math.floor(Number(vestInfo2.start + (vestInfo2.maxEnd - vestInfo2.start) / 2n)) - now
        );
        await xmyrd.connect(user2).exitVest(0);
        expect(+formatUnits(await xmyrd.pendingRebase())).approximately(+formatUnits(AMOUNT_2 / 4n), 1e-3);
        const PENALTY_2 = await xmyrd.pendingRebase();

        await gauge.connect(governance).updatePeriod(ADDITIONAL_REWARD_MYRD_2);

        // ------------ period 4
        await TimeUtils.advanceBlocksOnTs(WEEK);

        // ----------- user3 claims
        await gauge.connect(user3).getAllRewards(user3);
        expect(await myrd.balanceOf(user3)).approximately(
          (ADDITIONAL_REWARD_MYRD_1 + ADDITIONAL_REWARD_MYRD_2 + PENALTY_1 + PENALTY_2) * AMOUNT_3 / (AMOUNT_3 + AMOUNT_4),
          1n
        );

        // ----------- user4 claims
        await gauge.connect(user4).getAllRewards(user4);
        expect(await myrd.balanceOf(user4)).approximately(
          (ADDITIONAL_REWARD_MYRD_1 + ADDITIONAL_REWARD_MYRD_2 + PENALTY_1 + PENALTY_2) * AMOUNT_4 / (AMOUNT_3 + AMOUNT_4),
          1n
        );
      });
    });
    describe("Multiple rewards", () => {
      it("Multiple users, periods", async () => {
        const WEEK = 7*24*60*60;
        const DAY = 24*60*60;

        const ADDITIONAL_REWARD_MYRD_1 = parseUnits("100");
        const ADDITIONAL_REWARD_MYRD_2 = parseUnits("500");

        const REWARD_USDC_1 = parseUnits("100", 6);
        const REWARD_USDC_2 = parseUnits("500", 6);

        const REWARD_WETH_1 = parseUnits("100");
        const REWARD_WETH_2 = parseUnits("500");


        // ------------ update period (no users)
        await gauge.connect(governance).updatePeriod(0n);

        // ------------ provide assets to the users
        const AMOUNT_1 = parseUnits("20000"); // user 1: instant exit
        const AMOUNT_2 = parseUnits("2000");  // user 2: vesting with penalty
        const AMOUNT_3 = parseUnits("2000");  // user 3: collect 2/5 rewards, claim rewards regularly
        const AMOUNT_4 = parseUnits("3000");  // user 4: collect 3/5 rewards, claim all rewards at the end

        await myrd.connect(governance).transfer(user1, AMOUNT_1);
        await myrd.connect(governance).transfer(user2, AMOUNT_2);
        await myrd.connect(governance).transfer(user3, AMOUNT_3);
        await myrd.connect(governance).transfer(user4, AMOUNT_4);

        await myrd.connect(user1).approve(xmyrd, Misc.MAX_UINT);
        await myrd.connect(user2).approve(xmyrd, Misc.MAX_UINT);
        await myrd.connect(user3).approve(xmyrd, Misc.MAX_UINT);
        await myrd.connect(user4).approve(xmyrd, Misc.MAX_UINT);

        await usdcMock.connect(governance).mint(governance, REWARD_USDC_1 + REWARD_USDC_2);
        await wethMock.connect(governance).mint(governance, REWARD_WETH_1 + REWARD_WETH_2);

        await usdcMock.connect(governance).approve(gauge, Misc.MAX_UINT);
        await wethMock.connect(governance).approve(gauge, Misc.MAX_UINT);
        await myrd.connect(governance).approve(gauge, Misc.MAX_UINT);

        // ------------ setup USDC as rewards
        await gauge.connect(deployerInController).registerRewardToken(xmyrd, usdcMock);

        // ------------ enter
        await xmyrd.connect(user1).enter(AMOUNT_1);
        await xmyrd.connect(user2).enter(AMOUNT_2);
        await xmyrd.connect(user3).enter(AMOUNT_3);
        await xmyrd.connect(user4).enter(AMOUNT_4);
        expect(await gauge.totalSupply(xmyrd)).eq(AMOUNT_1 + AMOUNT_2 + AMOUNT_3 + AMOUNT_4);

        // ------------ period 1
        await TimeUtils.advanceBlocksOnTs(WEEK);
        await gauge.connect(governance).updatePeriod(0n); // no penalties

        // ------------ user1 and user 2 exit
        await TimeUtils.advanceBlocksOnTs(DAY);

        const PENALTY_1 = AMOUNT_1 / 2n;
        await xmyrd.connect(user1).exit(AMOUNT_1); // instant exit
        await xmyrd.connect(user2).createVest(AMOUNT_2); // exit with vesting
        expect(await xmyrd.pendingRebase()).eq(PENALTY_1);
        expect(await gauge.totalSupply(xmyrd)).eq(AMOUNT_3 + AMOUNT_4);

        await gauge.notifyRewardAmount(usdcMock, REWARD_USDC_1);

        // ------------ period 2
        await TimeUtils.advanceBlocksOnTs(WEEK);
        await gauge.notifyRewardAmount(usdcMock, REWARD_USDC_2);
        await gauge.connect(governance).updatePeriod(ADDITIONAL_REWARD_MYRD_1);
        expect(await xmyrd.pendingRebase()).eq(0n);

        // ------------ try to remove reward tokens
        await expect(await gauge.left(xmyrd, usdcMock)).gt(0n);
        await expect(gauge.connect(governance).removeRewardToken(xmyrd, usdcMock)).rejectedWith("Rewards not ended", "there is not empty amount of rewards for the current period");
        await expect(gauge.connect(governance).removeRewardToken(xmyrd, wethMock)).rejectedWith("Not reward token", "default token cannot be removed");

        // ------------ register WETH as reward
        await gauge.connect(deployerInController).registerRewardToken(xmyrd, wethMock);
        await expect(gauge.connect(deployerInController).registerRewardToken(xmyrd, wethMock)).rejectedWith("Already registered");
        await gauge.notifyRewardAmount(wethMock, REWARD_WETH_1);

        // ------------ period 3
        await TimeUtils.advanceBlocksOnTs(WEEK);
        await gauge.notifyRewardAmount(wethMock, REWARD_WETH_2);

        // ----------- user3 claims available rewards
        await gauge.connect(user3).getAllRewards(user3);
        expect(await myrd.balanceOf(user3)).approximately(
          (ADDITIONAL_REWARD_MYRD_1 + PENALTY_1) * AMOUNT_3 / (AMOUNT_3 + AMOUNT_4),
          1n
        );

        // ------------ user2 waits half of vesting period and exit with penalty
        const vestInfo2 = await xmyrd.vestInfo(user2, 0);
        const now = (await ethers.provider.getBlock("latest"))?.timestamp ?? 0;

        await TimeUtils.advanceBlocksOnTs(
          Math.floor(Number(vestInfo2.start + (vestInfo2.maxEnd - vestInfo2.start) / 2n)) - now
        );
        await xmyrd.connect(user2).exitVest(0);
        expect(+formatUnits(await xmyrd.pendingRebase())).approximately(+formatUnits(AMOUNT_2 / 4n), 1e-3);
        const PENALTY_2 = await xmyrd.pendingRebase();

        await gauge.connect(governance).updatePeriod(ADDITIONAL_REWARD_MYRD_2);

        // ------------ period 4
        await TimeUtils.advanceBlocksOnTs(WEEK);
        await expect(await gauge.left(xmyrd, usdcMock)).eq(0n);

        // ----------- user3 claims new rewards
        await gauge.connect(user3).getAllRewards(user3);
        expect(await myrd.balanceOf(user3)).approximately(
          (ADDITIONAL_REWARD_MYRD_1 + ADDITIONAL_REWARD_MYRD_2 + PENALTY_1 + PENALTY_2) * AMOUNT_3 / (AMOUNT_3 + AMOUNT_4),
          1n
        );

        // ----------- remove USDC form rewards
        await expect(await gauge.rewardTokensLength(xmyrd)).eq(2, "usdc and weth");
        await expect(gauge.connect(user1).removeRewardToken(xmyrd, usdcMock)).rejectedWith("Not allowed");
        await gauge.connect(deployerInController).removeRewardToken(xmyrd, usdcMock);
        await expect(await gauge.rewardTokensLength(xmyrd)).eq(1, "weth only");

        // ----------- user4 claims all rewards at once
        await gauge.connect(user4).getAllRewards(user4);
        expect(await myrd.balanceOf(user4)).approximately(
          (ADDITIONAL_REWARD_MYRD_1 + ADDITIONAL_REWARD_MYRD_2 + PENALTY_1 + PENALTY_2) * AMOUNT_4 / (AMOUNT_3 + AMOUNT_4),
          1n
        );


        // ----------- check USDC and WETH balances
        expect(+formatUnits(await usdcMock.balanceOf(user3), 6)).approximately(
          +formatUnits((REWARD_USDC_1 + REWARD_USDC_2)  * AMOUNT_3 / (AMOUNT_3 + AMOUNT_4), 6),
          0.001
        );
        expect(+formatUnits(await usdcMock.balanceOf(user4), 6)).eq(
          0, // +formatUnits((REWARD_USDC_1 + REWARD_USDC_2)  * AMOUNT_4 / (AMOUNT_3 + AMOUNT_4), 6),
          "rewards were removed before user tries to claim them"
        );
        expect(+formatUnits(await wethMock.balanceOf(user3))).approximately(
          +formatUnits((REWARD_WETH_1 + REWARD_WETH_2)  * AMOUNT_3 / (AMOUNT_3 + AMOUNT_4)),
          0.001
        );
        expect(+formatUnits(await wethMock.balanceOf(user4))).approximately(
          +formatUnits((REWARD_WETH_1 + REWARD_WETH_2)  * AMOUNT_4 / (AMOUNT_3 + AMOUNT_4)),
          0.001
        );
        expect(+formatUnits(await usdcMock.balanceOf(gauge), 6)).approximately(
          +formatUnits((REWARD_USDC_1 + REWARD_USDC_2)  * AMOUNT_4 / (AMOUNT_3 + AMOUNT_4), 6),
          0.001,
          "unclaimed rewards of the user 4"
        );
      });
    });
    describe("Very often notify calls of _notifyRewardAmount", () => {
      it("should receive all rewards even if _notifyRewardAmount is called before end of prev period", async () => {
        const WEEK = 7*24*60*60;
        const DAY = 24*60*60;

        const AMOUNT_USDC_1 = parseUnits("100", 6);
        const AMOUNT_USDC_2 = parseUnits("200", 6);
        const AMOUNT_USDC_3 = parseUnits("700", 6);

        // ------------ update period (no users)
        await gauge.connect(governance).updatePeriod(0n);

        // ------------ provide assets to the users
        const AMOUNT_1 = parseUnits("20000");

        await myrd.connect(governance).transfer(user1, AMOUNT_1);

        await myrd.connect(user1).approve(xmyrd, Misc.MAX_UINT);

        await usdcMock.connect(governance).mint(governance, AMOUNT_USDC_1 + AMOUNT_USDC_2 + AMOUNT_USDC_3);
        await usdcMock.connect(governance).approve(gauge, Misc.MAX_UINT);

        // ------------ setup USDC as rewards
        await gauge.connect(deployerInController).registerRewardToken(xmyrd, usdcMock);

        // ------------ enter
        await xmyrd.connect(user1).enter(AMOUNT_1);

        // ------------ period 1
        await TimeUtils.advanceBlocksOnTs(WEEK);
        await gauge.connect(governance).notifyRewardAmount(usdcMock, AMOUNT_USDC_1);

        await TimeUtils.advanceBlocksOnTs(DAY); // (!) wait 1 day only
        await gauge.connect(governance).notifyRewardAmount(usdcMock, AMOUNT_USDC_2);

        await TimeUtils.advanceBlocksOnTs(DAY); // (!) wait 1 day only
        await expect(
          gauge.connect(governance).notifyRewardAmount(usdcMock, AMOUNT_USDC_1)
        ).rejectedWith("Amount should be higher than remaining rewards");
        await gauge.connect(governance).notifyRewardAmount(usdcMock, AMOUNT_USDC_3);

        // ------------ period 2
        await TimeUtils.advanceBlocksOnTs(WEEK);

        // ----------- user1 claims available rewards
        await gauge.connect(user1).getAllRewards(user1);

        // ------------ check USDC balance
        expect(+formatUnits(await usdcMock.balanceOf(user1), 6)).approximately(
          +formatUnits((AMOUNT_USDC_1 + AMOUNT_USDC_2 + AMOUNT_USDC_3), 6),
          0.001
        );
      });
    });
  });
});