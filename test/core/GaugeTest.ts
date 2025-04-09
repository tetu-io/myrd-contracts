import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory, MockGauge,
  MockGauge__factory,
  MockToken, MultiGauge, MultiGauge__factory, StorageLocationChecker, StorageLocationChecker__factory,
  XMyrd,
  XMyrd__factory, XMyrdMock, XMyrdMock__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {expect} from "chai";
import {Deploy} from "../../scripts/deploy/Deploy";
import {parseUnits} from "ethers";

describe('GaugeTest', function() {
  let snapshotBefore: string;
  let snapshot: string;

  let deployer: Deploy;

  let signer: SignerWithAddress;
  let governance: SignerWithAddress;
  let storageLocationChecker: StorageLocationChecker;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  let controller: Controller;
  let xmyrd: XMyrd;
  let myrd: MockToken;
  let gauge: MultiGauge;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, governance, user1, user2, user3] = await ethers.getSigners();

    deployer = new Deploy(governance);
    controller = Controller__factory.connect(await deployer.deployProxyForTests('Controller'), signer);
    xmyrd = XMyrd__factory.connect(await deployer.deployProxyForTests('XMyrd'), signer); // todo use mock
    myrd = await DeployerUtils.deployMockToken(signer, 'MYRD', 18, false);
    gauge = MultiGauge__factory.connect(await deployer.deployProxyForTests("MultiGauge"), signer);
    storageLocationChecker = StorageLocationChecker__factory.connect(await (await deployer.deployContract('StorageLocationChecker')).getAddress(), signer);

    await controller.init(governance);
    await xmyrd.initialize(controller, myrd, gauge);

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

  describe("Storage and init", () => {
    it("check MULTI_GAUGE_STORAGE_LOCATION constant", async () => {
      const location = await storageLocationChecker.getMultiGaugeStorageLocation();
      console.log(location);
      expect(location).eq("0x635411329e3c391c04fb987a9e61aac0efad3b5dc95c142c0ec572a72e788100");
    });
    it("check MULTI_GAUGE_STORAGE_LOCATION calculations", async () => {
      const location = await storageLocationChecker.getStorageLocation("myrd.MultiGauge");
      expect(location).eq("0x635411329e3c391c04fb987a9e61aac0efad3b5dc95c142c0ec572a72e788100");
    });
    // we don't test getXMyrdLibStorage because there is no XMyrdLib
    it("should revert if call init second time", async () => {
      await gauge.init(controller, xmyrd, myrd);
      await expect(gauge.init(governance, xmyrd, myrd)).revertedWithCustomError(controller, "InvalidInitialization");
    });
  });

  describe("addStakingToken", () => {
    it("should allow to set xmyrd once", async () => {
      await gauge.init(controller, ethers.ZeroAddress, myrd);
      expect((await gauge.xMyrd()).toLowerCase()).eq(ethers.ZeroAddress);
      await gauge.connect(governance).addStakingToken(xmyrd);
      expect((await gauge.xMyrd()).toLowerCase()).eq((await xmyrd.getAddress()).toLowerCase());
      expect(await gauge.isStakeToken(xmyrd)).eq(true);
    });
    it("should not allow to change staking token", async () => {
      await gauge.init(controller, xmyrd, myrd);
      expect(await gauge.isStakeToken(xmyrd)).eq(true);
      expect((await gauge.xMyrd()).toLowerCase()).eq((await xmyrd.getAddress()).toLowerCase());
      await expect(gauge.connect(governance).addStakingToken(xmyrd)).revertedWithCustomError(gauge, "AlreadySet");
    });
    it("should revert if not governance", async () => {
      await gauge.init(controller, ethers.ZeroAddress, myrd);
      expect((await gauge.xMyrd()).toLowerCase()).eq(ethers.ZeroAddress);
      await expect(gauge.connect(user1).addStakingToken(xmyrd)).rejectedWith("Not allowed");
    });
  });

  describe("view", async () => {
    it("should return expected values", async () => {
      await gauge.init(controller, xmyrd, myrd);

      expect(await gauge.duration()).eq(7 * 24 * 60 * 60); // 1 week
      expect((await gauge.defaultRewardToken()).toLowerCase()).eq((await myrd.getAddress()).toLowerCase());
    });
  });

  describe("updatePeriod", () => {
    let snapshot1: string;
    let xmyrdMock: XMyrdMock;

    before(async function () {
      snapshot1 = await TimeUtils.snapshot();
      xmyrdMock = XMyrdMock__factory.connect(await (await deployer.deployContract('XMyrdMock', "x", "x")).getAddress(), signer);
    });

    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    it("should update period and call rebase", async () => {
      await gauge.init(controller, xmyrdMock, myrd);

      expect(await gauge.activePeriod()).eq(0n);
      expect(await xmyrdMock.isRebaseCalled()).eq(false);

      // --------------- at first let's move to the board of the period
      const period0 = Number(await gauge.getPeriod());
      const delta = (period0 + 1) * 7 * 24 * 60 * 60 - Math.floor(Date.now() / 1000);

      await TimeUtils.advanceBlocksOnTs(delta);
      const period1 = Number(await gauge.getPeriod());
      expect(period1).eq(period0 + 1);

      // --------------- update period first time
      await gauge.updatePeriod();
      expect(await xmyrdMock.isRebaseCalled()).eq(true);

      const activePeriod1 = await gauge.activePeriod();
      expect(activePeriod1).eq(period1);

      // --------------- move 3 days ahead
      await TimeUtils.advanceBlocksOnTs(3 * 24 * 60 * 60); // 3 days
      expect(await gauge.getPeriod()).eq(period1);

      await expect(gauge.updatePeriod()).revertedWithCustomError(gauge, "WaitForNewPeriod");

      // --------------- move 4 days ahead (1 week in total)
      await TimeUtils.advanceBlocksOnTs(4 * 24 * 60 * 60);
      expect(await gauge.getPeriod()).eq(period1 + 1);

      await gauge.updatePeriod();

      expect(await gauge.activePeriod()).eq(activePeriod1 + 1n);

    });
  });
});