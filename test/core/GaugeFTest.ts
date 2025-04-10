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

describe('GaugeFTest', function() {
  let snapshotBefore: string;
  let snapshot: string;

  let deployer: Deploy;

  let signer: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;

  let controller: Controller;
  let xmyrd: XMyrd;
  let myrd: MYRD;
  let gauge: MultiGauge;
  let wethMock: MockToken;
  let usdcMock: MockToken;
  let tokenFactory: TokenFactory;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, user1, user2, user3, user4] = await ethers.getSigners();


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
      expect((await controller.governance()).toLowerCase()).eq(signer.address.toLowerCase());

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
    });
  });
});