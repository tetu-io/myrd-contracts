import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory,
  MockToken,
  MultiGauge,
  MultiGauge__factory,
  MYRD,
  MYRD__factory,
  XMyrd,
  XMyrd__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {expect} from "chai";
import {Deploy} from "../../scripts/deploy/Deploy";
import {formatUnits, parseUnits} from "ethers";
import {DeployUtils} from "../utils/DeployUtils";

describe('XMyrdFTest', function() {
  let snapshotBefore: string;
  let snapshot: string;

  let deployer: Deploy;

  let signer: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  let controller: Controller;
  let xmyrd: XMyrd;
  let myrd: MYRD;
  let gauge: MultiGauge;
  let wethMock: MockToken;
  let usdcMock: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, governance, user1, user2, user3] = await ethers.getSigners();

    deployer = new Deploy(governance);
    controller = Controller__factory.connect(await deployer.deployProxyForTests('Controller'), signer);
    xmyrd = XMyrd__factory.connect(await deployer.deployProxyForTests('XMyrd'), signer);
    myrd = MYRD__factory.connect(await (await DeployerUtils.deployContract(signer, 'MYRD')).getAddress(), signer);
    gauge = MultiGauge__factory.connect(await deployer.deployProxyForTests('MultiGauge'), signer);

    wethMock = await DeployerUtils.deployMockToken(signer, 'WETH', 18, false);
    usdcMock = await DeployerUtils.deployMockToken(signer, 'USDC', 6, false);

    await controller.init(governance);
    await xmyrd.initialize(controller, myrd, gauge);
    await gauge.init(controller, xmyrd, usdcMock);

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

  describe("Enter", () => {
    const AMOUNT = 10_000n;
    let snapshot1: string;
    before(async function () {
      snapshot1 = await TimeUtils.snapshot();

      // -------------- provide myrd to user1, user2, user3
      await myrd.mint(user1, AMOUNT);
      await myrd.mint(user2, AMOUNT);
      await myrd.mint(user3, AMOUNT);

      await myrd.connect(user1).approve(xmyrd, AMOUNT);
      await myrd.connect(user2).approve(xmyrd, AMOUNT);
      await myrd.connect(user3).approve(xmyrd, AMOUNT);
    });
    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    it("should wrap myrd to xmyrd", async () => {
      const totalSupplyBefore = await xmyrd.totalSupply();
      expect(await xmyrd.balanceOf(user1)).eq(0);
      expect(await myrd.balanceOf(user1)).eq(AMOUNT);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(0);

      await xmyrd.connect(user1).enter(AMOUNT);
      const totalSupplyAfter = await xmyrd.totalSupply();

      expect(await xmyrd.balanceOf(user1)).eq(AMOUNT);
      expect(await myrd.balanceOf(user1)).eq(0);
      expect(await myrd.balanceOf(xmyrd)).eq(AMOUNT);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT);

      expect(totalSupplyAfter - totalSupplyBefore).eq(AMOUNT);
    });

    it("should revert if try to wrap zero amount", async () => {
      await expect(xmyrd.connect(user1).enter(0)).revertedWithCustomError(xmyrd, "IncorrectZeroArgument");
    });
  });

  describe("EnterFor", () => {
    const AMOUNT = 10_000n;
    let snapshot1: string;
    before(async function () {
      snapshot1 = await TimeUtils.snapshot();

      // -------------- provide myrd to user1, user2, user3
      await myrd.mint(user1, AMOUNT);
      await myrd.mint(user2, AMOUNT);
      await myrd.mint(user3, AMOUNT);

      await myrd.connect(user1).approve(xmyrd, AMOUNT);
      await myrd.connect(user2).approve(xmyrd, AMOUNT);
      await myrd.connect(user3).approve(xmyrd, AMOUNT);
    });
    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    it("should wrap myrd to xmyrd", async () => {
      const recipient = ethers.Wallet.createRandom().address;
      const totalSupplyBefore = await xmyrd.totalSupply();
      expect(await xmyrd.balanceOf(user1)).eq(0);
      expect(await myrd.balanceOf(user1)).eq(AMOUNT);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(0);

      await xmyrd.connect(user1).enterFor(AMOUNT, recipient);
      const totalSupplyAfter = await xmyrd.totalSupply();

      expect(await xmyrd.balanceOf(user1)).eq(0);
      expect(await xmyrd.balanceOf(recipient)).eq(AMOUNT);
      expect(await myrd.balanceOf(user1)).eq(0);
      expect(await myrd.balanceOf(xmyrd)).eq(AMOUNT);

      expect(await gauge.balanceOf(xmyrd, user1)).eq(0n);
      expect(await gauge.balanceOf(xmyrd, recipient)).eq(AMOUNT);

      expect(totalSupplyAfter - totalSupplyBefore).eq(AMOUNT);
    });

    it("should revert if try to wrap zero amount", async () => {
      await expect(xmyrd.connect(user1).enterFor(0, ethers.Wallet.createRandom().address)).revertedWithCustomError(xmyrd, "IncorrectZeroArgument");
    });
    it("should revert if try to user zero token", async () => {
      await expect(xmyrd.connect(user1).enterFor(1n, ethers.ZeroAddress)).revertedWithCustomError(xmyrd, "IncorrectZeroAddress");
    });
  });

  describe("Instant exit", () => {
    const AMOUNT = parseUnits("100");
    let snapshot1: string;
    before(async function () {
      snapshot1 = await TimeUtils.snapshot();

      // -------------- provide myrd to user1, user2, user3
      await myrd.mint(user1, AMOUNT);
      await myrd.mint(user2, AMOUNT);
      await myrd.mint(user3, AMOUNT);

      await myrd.connect(user1).approve(xmyrd, AMOUNT);
      await myrd.connect(user2).approve(xmyrd, AMOUNT);
      await myrd.connect(user3).approve(xmyrd, AMOUNT);
    });
    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    it("should take 50% penalty on instant exit", async () => {
      await xmyrd.connect(user1).enter(AMOUNT);

      const totalSupplyBefore = await xmyrd.totalSupply();
      expect(await xmyrd.balanceOf(user1)).eq(AMOUNT);
      expect(await myrd.balanceOf(user1)).eq(0);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT);
      expect(await xmyrd.pendingRebase()).eq(0n);

      const AMOUNT_EXIT = AMOUNT / 2n;
      await xmyrd.connect(user1).exit(AMOUNT_EXIT);
      const totalSupplyAfter = await xmyrd.totalSupply();

      expect(await xmyrd.balanceOf(user1)).eq(AMOUNT - AMOUNT_EXIT);
      expect(await myrd.balanceOf(user1)).eq(AMOUNT_EXIT / 2n);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT - AMOUNT_EXIT, "handleBalanceChange is called");
      expect(await xmyrd.pendingRebase()).eq(AMOUNT_EXIT / 2n);
      expect(totalSupplyBefore - totalSupplyAfter).eq(AMOUNT_EXIT);
    });

    it("should revert if try to exit with zero amount", async () => {
      await expect(xmyrd.connect(user1).exit(0)).revertedWithCustomError(xmyrd, "IncorrectZeroArgument");
    });
  });

  describe("Exit with vesting", () => {
    const AMOUNT = parseUnits("100");
    let snapshot1: string;
    before(async function () {
      snapshot1 = await TimeUtils.snapshot();

      // -------------- provide myrd to user1, user2, user3
      await myrd.mint(user1, AMOUNT);
      await myrd.mint(user2, AMOUNT);
      await myrd.mint(user3, AMOUNT);

      await myrd.connect(user1).approve(xmyrd, AMOUNT);
      await myrd.connect(user2).approve(xmyrd, AMOUNT);
      await myrd.connect(user3).approve(xmyrd, AMOUNT);
    });
    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    it("should exit with 100% amount of myrd", async () => {
      const AMOUNT_EXIT = AMOUNT / 4n;

      await xmyrd.connect(user1).enter(AMOUNT);

      const totalSupplyBefore = await xmyrd.totalSupply();
      await xmyrd.connect(user1).createVest(AMOUNT_EXIT);
      const totalSupplyAfter = await xmyrd.totalSupply();

      expect(await xmyrd.balanceOf(user1)).eq(AMOUNT - AMOUNT_EXIT);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT - AMOUNT_EXIT, "handleBalanceChange is called");
      expect(totalSupplyBefore - totalSupplyAfter).eq(AMOUNT_EXIT, "xmyrd is burnt");
      expect(await myrd.balanceOf(user1)).eq(0n);
      expect(await xmyrd.usersTotalVests(user1)).eq(1);

      const vestInfo = await xmyrd.vestInfo(user1, 0);
      expect(vestInfo.start).gt(0);
      expect(vestInfo.maxEnd).eq(Number(vestInfo.start) + 180 * 24 * 60 * 60);
      expect(vestInfo.amount).eq(AMOUNT_EXIT);

      await TimeUtils.advanceBlocksOnTs(180 * 24 * 60 * 60); // total vesting period

      await xmyrd.connect(user1).exitVest(0);
      expect(await myrd.balanceOf(user1)).eq(AMOUNT_EXIT);
      expect(await xmyrd.pendingRebase()).eq(0n);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT - AMOUNT_EXIT);

      const vestInfoAfter = await xmyrd.vestInfo(user1, 0);
      expect(vestInfoAfter.start).eq(vestInfo.start);
      expect(vestInfoAfter.maxEnd).eq(vestInfo.maxEnd);
      expect(vestInfoAfter.amount).eq(0);

    });

    it("should exit with (50% + 1/10) amount of myrd", async () => {
      const AMOUNT_EXIT = parseUnits("180");
      const TOTAL_AMOUNT = parseUnits("200");
      const MAX_VEST = 180 * 24 * 60 * 60;

      // -------------- User 1 should have 200 xmyrd in total
      await myrd.mint(user1, TOTAL_AMOUNT - AMOUNT);
      await myrd.connect(user1).approve(xmyrd, TOTAL_AMOUNT);
      await xmyrd.connect(user1).enter(TOTAL_AMOUNT);
      expect(await xmyrd.balanceOf(user1)).eq(TOTAL_AMOUNT);

      const totalSupplyBefore = await xmyrd.totalSupply();
      await xmyrd.connect(user1).createVest(AMOUNT_EXIT);
      const totalSupplyAfter = await xmyrd.totalSupply();

      expect(await gauge.balanceOf(xmyrd, user1)).eq(TOTAL_AMOUNT - AMOUNT_EXIT, "handleBalanceChange is called");
      expect(totalSupplyBefore - totalSupplyAfter).eq(AMOUNT_EXIT, "xmyrd is burnt");
      expect(await myrd.balanceOf(user1)).eq(0n);
      expect(await xmyrd.usersTotalVests(user1)).eq(1);
      expect(await xmyrd.balanceOf(user1)).eq(TOTAL_AMOUNT - AMOUNT_EXIT);

      const vestInfo = await xmyrd.vestInfo(user1, 0);
      expect(vestInfo.start).gt(0);
      expect(vestInfo.maxEnd).eq(Number(vestInfo.start) + MAX_VEST);
      expect(vestInfo.amount).eq(AMOUNT_EXIT);

      await TimeUtils.advanceBlocksOnTs(MAX_VEST / 10); // 18 days = 18/180 = 1/10 of the vesting period

      await xmyrd.connect(user1).exitVest(0);
      const blockTimeStamp = (await ethers.provider.getBlock("latest"))?.timestamp ?? 0;
      const earnedApprox = Number(AMOUNT_EXIT) / 2 * (1 + (blockTimeStamp - Number(vestInfo.start)) / MAX_VEST);
      const earnedExact = await myrd.balanceOf(user1);

      expect(await xmyrd.balanceOf(user1)).eq(TOTAL_AMOUNT - AMOUNT_EXIT);
      expect(+formatUnits(earnedExact)).approximately(+formatUnits(BigInt(earnedApprox)), 1e-8);
      expect(await xmyrd.pendingRebase()).eq(AMOUNT_EXIT - earnedExact);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(TOTAL_AMOUNT - AMOUNT_EXIT, "no changes");

      const vestInfoAfter = await xmyrd.vestInfo(user1, 0);
      expect(vestInfoAfter.start).eq(vestInfo.start);
      expect(vestInfoAfter.maxEnd).eq(vestInfo.maxEnd);
      expect(vestInfoAfter.amount).eq(0);

      expect(await xmyrd.totalSupply()).eq(totalSupplyAfter, "no changes");

      await expect(xmyrd.connect(user1).exitVest(0)).revertedWithCustomError(xmyrd, "NO_VEST");
    });

    it("should cancel vesting", async () => {
      const AMOUNT_EXIT = AMOUNT / 5n;

      // -------------- myrd => xmyrd
      await xmyrd.connect(user1).enter(AMOUNT);

      expect(await myrd.balanceOf(user1)).eq(0);
      expect(await xmyrd.balanceOf(user1)).eq(AMOUNT);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT);

      // -------------- create vest
      const totalSupplyBefore = await xmyrd.totalSupply();
      await xmyrd.connect(user1).createVest(AMOUNT_EXIT);
      const totalSupplyMiddle = await xmyrd.totalSupply();

      expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT - AMOUNT_EXIT, "handleBalanceChange is called");
      expect(totalSupplyBefore - totalSupplyMiddle).eq(AMOUNT_EXIT, "xmyrd is burnt");
      expect(await myrd.balanceOf(user1)).eq(0n);
      expect(await xmyrd.usersTotalVests(user1)).eq(1);
      expect(await xmyrd.balanceOf(user1)).eq(AMOUNT - AMOUNT_EXIT);

      const vestInfo = await xmyrd.vestInfo(user1, 0);
      expect(vestInfo.start).gt(0);
      expect(vestInfo.maxEnd).eq(Number(vestInfo.start) + 180 * 24 * 60 * 60);
      expect(vestInfo.amount).eq(AMOUNT_EXIT);

      // -------------- move < 14 days ahead
      await TimeUtils.advanceBlocksOnTs(14 * 24 * 60 * 60 - 100); // less than 14 days => cancel

      // -------------- exit vesting
      await xmyrd.connect(user1).exitVest(0);
      const totalSupplyFinal = await xmyrd.totalSupply();

      // -------------- ensure that the vesting is canceled
      expect(await myrd.balanceOf(user1)).eq(0);
      expect(await xmyrd.balanceOf(user1)).eq(AMOUNT);
      expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT);

      const vestInfoAfter = await xmyrd.vestInfo(user1, 0);
      expect(vestInfoAfter.start).eq(vestInfo.start);
      expect(vestInfoAfter.maxEnd).eq(vestInfo.maxEnd);
      expect(vestInfoAfter.amount).eq(0);

      await expect(xmyrd.connect(user1).exitVest(0)).revertedWithCustomError(xmyrd, "NO_VEST");
      expect(totalSupplyFinal).eq(totalSupplyBefore);
    });

    it("should revert if try to create vest with zero amount", async () => {
      await expect(xmyrd.createVest(0n)).revertedWithCustomError(xmyrd, "IncorrectZeroArgument");
    });
  });

  describe("Rebase", () => {
    const AMOUNT = parseUnits("100");
    let snapshot1: string;
    before(async function () {
      snapshot1 = await TimeUtils.snapshot();

      // -------------- provide myrd to user1, user2, user3
      await myrd.mint(user1, AMOUNT);
      await myrd.mint(user2, AMOUNT);
      await myrd.mint(user3, AMOUNT);

      await myrd.connect(user1).approve(xmyrd, AMOUNT);
      await myrd.connect(user2).approve(xmyrd, AMOUNT);
      await myrd.connect(user3).approve(xmyrd, AMOUNT);
    });
    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    it("should send pendingRebase to gauge in normal case", async () => {
      // -------------- myrd => xmyrd
      await xmyrd.connect(user1).enter(AMOUNT);

      // -------------- instance exit with penalty 50%
      await xmyrd.connect(user1).exit(AMOUNT);

      // -------------- rebase
      const gaugeAsSigner = await DeployUtils.impersonate(await gauge.getAddress());
      await xmyrd.connect(gaugeAsSigner).rebase();

      expect(await myrd.balanceOf(gauge)).eq(AMOUNT / 2n);
      expect(await xmyrd.balanceOf(gauge)).eq(0n);
      expect(await xmyrd.lastDistributedPeriod()).eq(await gauge.getPeriod());
    });

    it("should NOT send pendingRebase to gauge if rebase was already called in the given period", async () => {
      // -------------- myrd => xmyrd 1
      await xmyrd.connect(user1).enter(AMOUNT);

      // -------------- instance exit 1 with penalty 50%
      await xmyrd.connect(user1).exit(AMOUNT);

      // -------------- first rebase in the period
      const gaugeAsSigner = await DeployUtils.impersonate(await gauge.getAddress());
      await xmyrd.connect(gaugeAsSigner).rebase();

      // -------------- check results 1
      expect(await xmyrd.lastDistributedPeriod()).eq(await gauge.getPeriod());
      expect(await myrd.balanceOf(gauge)).eq(AMOUNT / 2n);
      expect(await xmyrd.pendingRebase()).eq(0n, "all penalties were transferred to the gauge");

      // -------------- myrd => xmyrd 2
      await myrd.mint(user1, AMOUNT);
      await myrd.connect(user1).approve(xmyrd, AMOUNT);
      await xmyrd.connect(user1).enter(AMOUNT);

      // -------------- instance exit 2 with penalty 50%
      await xmyrd.connect(user1).exit(AMOUNT);

      // -------------- second rebase in the same period
      await xmyrd.connect(gaugeAsSigner).rebase();

      // -------------- check results 2
      expect(await xmyrd.lastDistributedPeriod()).eq(await gauge.getPeriod());
      expect(await myrd.balanceOf(gauge)).eq(AMOUNT / 2n, "not changed");
      expect(await xmyrd.pendingRebase()).eq(AMOUNT / 2n, "not transferred to the gauge");
    });

    it("should NOT send pendingRebase to gauge if penalties < BASIS", async () => {
      const SMALL_AMOUNT = 2n * (await xmyrd.BASIS()) - 2n;

      // -------------- myrd => xmyrd
      await xmyrd.connect(user1).enter(SMALL_AMOUNT);

      // -------------- instance exit with penalty 50%
      await xmyrd.connect(user1).exit(SMALL_AMOUNT);

      // -------------- rebase
      const gaugeAsSigner = await DeployUtils.impersonate(await gauge.getAddress());
      await xmyrd.connect(gaugeAsSigner).rebase();

      // -------------- check results
      expect(await xmyrd.lastDistributedPeriod()).eq(0n);
      expect(await myrd.balanceOf(gauge)).eq(0n, "not changed");
      expect(await xmyrd.pendingRebase()).eq(SMALL_AMOUNT / 2n, "not transferred to the gauge");
    });

    it("should revert if not gauge", async () => {
      await expect(xmyrd.connect(user1).rebase()).revertedWithCustomError(xmyrd, "NotGauge");
    });
  });
});