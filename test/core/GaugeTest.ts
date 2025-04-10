import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory, MockToken, MultiGauge, MultiGauge__factory, StorageLocationChecker, StorageLocationChecker__factory,
  XMyrd,
  XMyrd__factory, XMyrdMock, XMyrdMock__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {expect} from "chai";
import {Deploy} from "../../scripts/deploy/Deploy";
import {Misc} from "../../scripts/Misc";
import {DeployUtils} from "../utils/DeployUtils";
import {formatUnits, parseUnits} from "ethers";

describe('GaugeTest', function() {
  let snapshotBefore: string;
  let snapshotEach: string;

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
  let usdc: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, governance, user1, user2, user3] = await ethers.getSigners();

    deployer = new Deploy(governance);
    controller = Controller__factory.connect(await deployer.deployProxyForTests('Controller'), signer);
    xmyrd = XMyrd__factory.connect(await deployer.deployProxyForTests('XMyrd'), signer); // todo use mock
    myrd = await DeployerUtils.deployMockToken(signer, 'MYRD', 18, false);
    usdc = await DeployerUtils.deployMockToken(signer, 'USDC', 6, false);
    gauge = MultiGauge__factory.connect(await deployer.deployProxyForTests("MultiGauge"), signer);
    storageLocationChecker = StorageLocationChecker__factory.connect(await (await deployer.deployContract('StorageLocationChecker')).getAddress(), signer);

    await controller.init(governance);
    await xmyrd.initialize(controller, myrd, gauge);

  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });

  beforeEach(async function () {
    snapshotEach = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshotEach);
  });

  describe("Storage", () => {
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
  });

  describe("Init", () => {
    it("should revert if call init second time", async () => {
      await gauge.init(controller, xmyrd, myrd);
      await expect(gauge.init(governance, xmyrd, myrd)).revertedWithCustomError(controller, "InvalidInitialization");
    });
    it("should revert if try to use zero myrd or zero xmyrd", async () => {
      await expect(gauge.init(governance, xmyrd, ethers.ZeroAddress)).rejectedWith("Zero default reward token");
      await expect(gauge.init(governance, ethers.ZeroAddress, myrd)).revertedWithCustomError(gauge, "ZeroAddress");
    });
  });

  describe("addStakingToken", () => {
    it("should not allow to change staking token", async () => {
      await gauge.init(controller, xmyrd, myrd);
      expect(await gauge.isStakeToken(xmyrd)).eq(true);
      expect((await gauge.xMyrd()).toLowerCase()).eq((await xmyrd.getAddress()).toLowerCase());
      await expect(gauge.connect(governance).addStakingToken(xmyrd)).revertedWithCustomError(gauge, "AlreadySet");
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
      xmyrdMock = XMyrdMock__factory.connect(await (
        await deployer.deployContract('XMyrdMock', myrd, gauge)
      ).getAddress(), signer);
      await gauge.init(controller, xmyrdMock, myrd);
    });

    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    interface IParams {
      amount: bigint;
      penalties: bigint;
      timePassedSincePeriodStartSeconds?: number;
      balanceSigner?: bigint;
      useInitialUpdate?: boolean;
    }

    interface IResults {
      periodBefore: number;
      periodAfter: number;
      activePeriod: number;

      gaugeMyrdBalance: bigint;
      signerMyrdBalance: bigint;
      xmyrdMyrdBalance: bigint;

      rewardRate: bigint;
      lastUpdateTime: number;
      periodFinish: number;
      blockTimestamp: number;
    }

    async function makeTest(p: IParams): Promise<IResults> {
      // --------------- at first let's move to the board of the period
      const period0 = Number(await gauge.getPeriod());
      const delta = (period0 + 1) * 7 * 24 * 60 * 60 - Math.floor(Date.now() / 1000);

      await TimeUtils.advanceBlocksOnTs(delta);

      if (p.useInitialUpdate) {
        await gauge.updatePeriod(0n);
      }

      const periodBefore = Number(await gauge.getPeriod());
      await TimeUtils.advanceBlocksOnTs(p.timePassedSincePeriodStartSeconds ?? 7 * 24 * 60 * 60);
      const periodAfter = Number(await gauge.getPeriod());

      // --------------- prepare initial balances
      if (p.penalties != 0n) {
        await myrd.mint(xmyrdMock, p.penalties);
      }

      if (p.balanceSigner ?? p.amount != 0n) {
        await myrd.mint(signer, p.balanceSigner ?? p.amount);
      }
      await myrd.connect(signer).approve(gauge, Misc.MAX_UINT);

      // --------------- updatePeriod
      const tx = await gauge.connect(signer).updatePeriod(p.amount);
      const cr = await tx.wait();
      const blockTimestamp = (await ethers.provider.getBlock(cr?.blockNumber ?? 0))?.timestamp;

      return {
        periodBefore,
        periodAfter,
        activePeriod: Number(await gauge.activePeriod()),
        gaugeMyrdBalance: await myrd.balanceOf(gauge),
        signerMyrdBalance: await myrd.balanceOf(signer),
        xmyrdMyrdBalance: await myrd.balanceOf(xmyrdMock),
        rewardRate: await gauge.rewardRate(xmyrdMock, myrd),
        lastUpdateTime: Number(await gauge.lastUpdateTime(xmyrdMock, myrd)),
        periodFinish: Number(await gauge.periodFinish(xmyrdMock, myrd)),
        blockTimestamp: blockTimestamp ?? 0,
      }
    }

    it("should return expected values if no penalties, no amount", async () => {
      const ret = await makeTest({
        amount: 0n,
        penalties: 0n,
        balanceSigner: 1n,
      });

      expect(ret.periodBefore).eq(ret.periodAfter - 1);
      expect(ret.activePeriod).eq(ret.periodAfter);

      expect(ret.gaugeMyrdBalance).eq(0n);
      expect(ret.signerMyrdBalance).eq(1n);
      expect(ret.xmyrdMyrdBalance).eq(0n);
    });

    it("should return expected values if penalties only", async () => {
      const ret = await makeTest({
        amount: 0n,
        penalties: 2n,
        balanceSigner: 1n,
      });
      console.log(ret);

      expect(ret.periodBefore).eq(ret.periodAfter - 1);
      expect(ret.activePeriod).eq(ret.periodAfter);

      expect(ret.gaugeMyrdBalance).eq(2n);
      expect(ret.signerMyrdBalance).eq(1n);
      expect(ret.xmyrdMyrdBalance).eq(0n);

      // see _notifyRewardAmount implementation
      expect(ret.rewardRate).eq(2n * 10n**27n / (7n * 24n * 60n * 60n));
      expect(ret.lastUpdateTime).eq(ret.blockTimestamp);
      expect(ret.periodFinish).eq(ret.blockTimestamp + 7 * 24 * 60 * 60);
    });

    it("should return expected values if amount only", async () => {
      const ret = await makeTest({
        amount: 2n,
        penalties: 0n,
        balanceSigner: 2n,
      });

      expect(ret.periodBefore).eq(ret.periodAfter - 1);
      expect(ret.activePeriod).eq(ret.periodAfter);

      expect(ret.gaugeMyrdBalance).eq(2n);
      expect(ret.signerMyrdBalance).eq(0n);
      expect(ret.xmyrdMyrdBalance).eq(0n);

      // see _notifyRewardAmount implementation
      expect(ret.rewardRate).eq(2n * 10n**27n / (7n * 24n * 60n * 60n));
      expect(ret.lastUpdateTime).eq(ret.blockTimestamp);
      expect(ret.periodFinish).eq(ret.blockTimestamp + 7 * 24 * 60 * 60);
    });

    it("should return expected values if penalties + amount", async () => {
      const ret = await makeTest({
        amount: 2n,
        penalties: 3n,
        balanceSigner: 2n,
      });

      expect(ret.periodBefore).eq(ret.periodAfter - 1);
      expect(ret.activePeriod).eq(ret.periodAfter);

      expect(ret.gaugeMyrdBalance).eq(5n);
      expect(ret.signerMyrdBalance).eq(0n);
      expect(ret.xmyrdMyrdBalance).eq(0n);

      // see _notifyRewardAmount implementation
      expect(ret.rewardRate).eq(5n * 10n**27n / (7n * 24n * 60n * 60n));
      expect(ret.lastUpdateTime).eq(ret.blockTimestamp);
      expect(ret.periodFinish).eq(ret.blockTimestamp + 7 * 24 * 60 * 60);
    });

    it("should revert if new period is not started", async () => {
      await expect(makeTest({
        amount: 1n,
        penalties: 0n,
        useInitialUpdate: true,
        timePassedSincePeriodStartSeconds: 3 * 24 * 60 * 60, // 3 days of 7 required
      })).revertedWithCustomError(gauge, "WaitForNewPeriod");
    });
  });

  describe("notifyRewardAmount", () => {
    let snapshot1: string;
    let xmyrdMock: XMyrdMock;

    before(async function () {
      snapshot1 = await TimeUtils.snapshot();
      xmyrdMock = XMyrdMock__factory.connect(await (
        await deployer.deployContract('XMyrdMock', myrd, gauge)
      ).getAddress(), signer);
      await gauge.init(controller, xmyrdMock, myrd);
    });

    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    interface IParams {
      useMyrdToken: boolean;
      amount: bigint;
      balanceXMyrd?: bigint;
      balanceSigner?: bigint;
      dontAllowRewardToken?: boolean;
      registerByDeployer?: boolean;
    }

    interface IResults {
      gaugeTokenBalance: bigint;
      signerTokenBalance: bigint;
      xmyrdMyrdBalance: bigint;

      rewardRate: bigint;
      lastUpdateTime: number;
      periodFinish: number;
      blockTimestamp: number;
    }

    async function makeTest(p: IParams): Promise<IResults> {
      // --------------- at first let's move to the board of the period
      const period0 = Number(await gauge.getPeriod());
      const delta = (period0 + 1) * 7 * 24 * 60 * 60 - Math.floor(Date.now() / 1000);

      await TimeUtils.advanceBlocksOnTs(delta);

      // --------------- prepare reward token
      const rewardToken = p.useMyrdToken ? myrd : usdc;
      if (! p.useMyrdToken && !p.dontAllowRewardToken) {
        if (p.registerByDeployer) {
          const deployer = await DeployUtils.impersonate(ethers.Wallet.createRandom().address);
          await controller.connect(governance).changeDeployer(deployer, false);
          await gauge.connect(deployer).registerRewardToken(xmyrdMock, rewardToken);
        } else {
          await gauge.connect(governance).registerRewardToken(xmyrdMock, rewardToken);
        }
      }

      // --------------- prepare initial balances
      if (p.balanceXMyrd) {
        await myrd.mint(xmyrdMock, p.balanceXMyrd);
      }

      if (p.balanceSigner ?? p.amount != 0n) {
        await rewardToken.mint(signer, p.balanceSigner ?? p.amount);
      }
      await rewardToken.connect(signer).approve(gauge, Misc.MAX_UINT);

      // --------------- updatePeriod
      const tx = await gauge.connect(signer).notifyRewardAmount(rewardToken, p.amount);
      const cr = await tx.wait();
      const blockTimestamp = (await ethers.provider.getBlock(cr?.blockNumber ?? 0))?.timestamp;

      return {
        gaugeTokenBalance: await rewardToken.balanceOf(gauge),
        signerTokenBalance: await rewardToken.balanceOf(signer),
        xmyrdMyrdBalance: await myrd.balanceOf(xmyrdMock),
        rewardRate: await gauge.rewardRate(xmyrdMock, rewardToken),
        lastUpdateTime: Number(await gauge.lastUpdateTime(xmyrdMock, rewardToken)),
        periodFinish: Number(await gauge.periodFinish(xmyrdMock, rewardToken)),
        blockTimestamp: blockTimestamp ?? 0,
      }
    }

    it("should return expected values if reward token is USDC", async () => {
      const ret = await makeTest({
        useMyrdToken: false,
        amount: 2n,
        balanceSigner: 77n,
        balanceXMyrd: 5n,
      });

      expect(ret.gaugeTokenBalance).eq(2n);
      expect(ret.signerTokenBalance).eq(77n - 2n);
      expect(ret.xmyrdMyrdBalance).eq(5n, "rebase wasn't called");

      // see _notifyRewardAmount implementation
      expect(ret.rewardRate).eq(2n * 10n**27n / (7n * 24n * 60n * 60n));
      expect(ret.lastUpdateTime).eq(ret.blockTimestamp);
      expect(ret.periodFinish).eq(ret.blockTimestamp + 7 * 24 * 60 * 60);
    });

    it("reward token should be registered by deployer", async () => {
      const ret = await makeTest({
        useMyrdToken: false,
        amount: 2n,
        balanceSigner: 77n,
        balanceXMyrd: 5n,
        registerByDeployer: true
      });

      expect(ret.gaugeTokenBalance).eq(2n);
      expect(ret.signerTokenBalance).eq(77n - 2n);
      expect(ret.xmyrdMyrdBalance).eq(5n, "rebase wasn't called");

      // see _notifyRewardAmount implementation
      expect(ret.rewardRate).eq(2n * 10n**27n / (7n * 24n * 60n * 60n));
      expect(ret.lastUpdateTime).eq(ret.blockTimestamp);
      expect(ret.periodFinish).eq(ret.blockTimestamp + 7 * 24 * 60 * 60);
    });

    it("should revert if myrd token", async () => {
      await expect(makeTest({useMyrdToken: true, amount: 1n})).revertedWithCustomError(gauge, "ShouldUseUpdatePeriod");
    });

    it("should revert if reward token not allowed", async () => {
      await expect(makeTest({useMyrdToken: false, amount: 1n, dontAllowRewardToken: true})).rejectedWith("Token not allowed");
    });

    it("should revert if zero amount", async () => {
      await expect(makeTest({useMyrdToken: false, amount: 0n})).rejectedWith("Zero amount");
    });
  });

  describe("handleBalanceChange", () => {
    let snapshot1: string;
    let xmyrdMock: XMyrdMock;

    before(async function () {
      snapshot1 = await TimeUtils.snapshot();
      xmyrdMock = XMyrdMock__factory.connect(await (
        await deployer.deployContract('XMyrdMock', myrd, gauge)
      ).getAddress(), signer);
      await gauge.init(controller, xmyrdMock, myrd);
    });

    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    interface IState {
      totalSupply: bigint;
      balanceOf: bigint;
      derivedBalance: bigint;
      derivedSupply: bigint;
    }

    interface IParams {
      xMyrdBalance0: bigint;
      xMyrdBalance1: bigint;
      xMyrdBalanceAccount2?: bigint;

      senderIsNotXMyrd?: boolean;
    }

    interface IResults {
      state0: IState;
      state1: IState;
    }

    async function getState(account: string): Promise<IState> {
      return {
        balanceOf: await gauge.balanceOf(xmyrdMock, account),
        derivedBalance: await gauge.derivedBalance(xmyrdMock, account),
        derivedSupply: await gauge.derivedSupply(xmyrdMock),
        totalSupply: await gauge.totalSupply(xmyrdMock),
      }
    }

    async function makeTest(p: IParams): Promise<IResults> {
      const account = ethers.Wallet.createRandom().address;
      const account2 = ethers.Wallet.createRandom().address;

      const signer = p.senderIsNotXMyrd
        ? user1
        : await DeployUtils.impersonate(await xmyrdMock.getAddress());

      // --------------- account 2
      if (p.xMyrdBalanceAccount2) {
        await xmyrdMock.mint(account2, p.xMyrdBalanceAccount2);
        await gauge.connect(signer).handleBalanceChange(account2);
      }

      // --------------- first handleBalanceChange
      await xmyrdMock.mint(account, p.xMyrdBalance0);
      await gauge.connect(signer).handleBalanceChange(account);
      const state0 = await getState(account);

      // --------------- second handleBalanceChange
      if (p.xMyrdBalance1 > p.xMyrdBalance0) {
        await xmyrdMock.mint(account, p.xMyrdBalance1 - p.xMyrdBalance0);
      } else {
        await xmyrdMock["burn(address,uint256)"](account, p.xMyrdBalance0 - p.xMyrdBalance1);
      }

      await gauge.connect(signer).handleBalanceChange(account);
      const state1 = await getState(account);

      return {state0, state1}
    }

    it("should return expected values on balance increasing", async () => {
      const AMOUNT_ACCOUNT_2 = 1n;
      const AMOUNT1 = 5n;
      const AMOUNT2 = 10n;
      const r = await makeTest({
        xMyrdBalance0: AMOUNT1,
        xMyrdBalance1: AMOUNT2,
        xMyrdBalanceAccount2: AMOUNT_ACCOUNT_2
      });

      expect(r.state0.totalSupply).eq(AMOUNT1 + AMOUNT_ACCOUNT_2);
      expect(r.state0.derivedSupply).eq(AMOUNT1 + AMOUNT_ACCOUNT_2);

      expect(r.state0.balanceOf).eq(AMOUNT1);
      expect(r.state0.derivedBalance).eq(AMOUNT1);

      expect(r.state1.totalSupply).eq(AMOUNT2 + AMOUNT_ACCOUNT_2);
      expect(r.state1.derivedSupply).eq(AMOUNT2 + AMOUNT_ACCOUNT_2);

      expect(r.state1.balanceOf).eq(AMOUNT2);
      expect(r.state1.derivedBalance).eq(AMOUNT2);
    });

    it("should return expected values on balance increasing", async () => {
      const AMOUNT_ACCOUNT_2 = 1n;
      const AMOUNT1 = 10n;
      const AMOUNT2 = 5n;
      const r = await makeTest({
        xMyrdBalance0: AMOUNT1,
        xMyrdBalance1: AMOUNT2,
        xMyrdBalanceAccount2: AMOUNT_ACCOUNT_2
      });

      expect(r.state0.totalSupply).eq(AMOUNT1 + AMOUNT_ACCOUNT_2);
      expect(r.state0.derivedSupply).eq(AMOUNT1 + AMOUNT_ACCOUNT_2);

      expect(r.state0.balanceOf).eq(AMOUNT1);
      expect(r.state0.derivedBalance).eq(AMOUNT1);

      expect(r.state1.totalSupply).eq(AMOUNT2 + AMOUNT_ACCOUNT_2);
      expect(r.state1.derivedSupply).eq(AMOUNT2 + AMOUNT_ACCOUNT_2);

      expect(r.state1.balanceOf).eq(AMOUNT2);
      expect(r.state1.derivedBalance).eq(AMOUNT2);
    });

    it("should not change values if balance is not changed", async () => {
      const AMOUNT_ACCOUNT_2 = 1n;
      const AMOUNT = 10n;
      const r = await makeTest({
        xMyrdBalance0: AMOUNT,
        xMyrdBalance1: AMOUNT,
        xMyrdBalanceAccount2: AMOUNT_ACCOUNT_2
      });

      expect(r.state0.totalSupply).eq(AMOUNT + AMOUNT_ACCOUNT_2);
      expect(r.state0.derivedSupply).eq(AMOUNT + AMOUNT_ACCOUNT_2);

      expect(r.state0.balanceOf).eq(AMOUNT);
      expect(r.state0.derivedBalance).eq(AMOUNT);

      expect(r.state1.totalSupply).eq(r.state0.totalSupply);
      expect(r.state1.derivedSupply).eq(r.state0.derivedSupply);

      expect(r.state1.balanceOf).eq(r.state0.balanceOf);
      expect(r.state1.derivedBalance).eq(r.state0.derivedBalance);
    });

    it("should revert if called from not xmyrd", async () => {
      await expect(
        makeTest({xMyrdBalance0: 1n, xMyrdBalance1: 2n, senderIsNotXMyrd: true})
      ).revertedWithCustomError(gauge, "WrongStakingToken");
    });
  });

  describe("getAllRewards", () => {
    it("should receive all rewards if period is passed", async () => {
      const PENALTIES_AMOUNT_MYRD = parseUnits("500");
      const REWARDS_USDC = parseUnits("100", 6);
      const XMYRD_AMOUNT = parseUnits("2000");
      const ADDITIONAL_AMOUNT_MYRD = parseUnits("7000");

      // -------------------- let's use mocked xmyrd with predefined penalties amount
      const xmyrdMock = XMyrdMock__factory.connect(await (await deployer.deployContract('XMyrdMock', myrd, gauge)).getAddress(), signer);
      await gauge.init(controller, xmyrdMock, myrd);
      await myrd.mint(xmyrdMock, PENALTIES_AMOUNT_MYRD);

      // -------------------- register USDC as reward token and provide rewards amount
      await gauge.connect(governance).registerRewardToken(xmyrdMock, usdc);
      await usdc.mint(user1, REWARDS_USDC);
      await usdc.connect(user1).approve(gauge, Misc.MAX_UINT);
      await gauge.connect(user1).notifyRewardAmount(usdc, REWARDS_USDC);

      // -------------------- signer receives xmyrd and automatically stakes them
      const xmyrdAsSigner = await DeployUtils.impersonate(await xmyrdMock.getAddress());
      await xmyrdMock.mint(signer, XMYRD_AMOUNT);
      await gauge.connect(xmyrdAsSigner).handleBalanceChange(signer.getAddress());

      // -------------------- provide additional MYRD-rewards
      await myrd.mint(user1, ADDITIONAL_AMOUNT_MYRD);
      await myrd.connect(user1).approve(gauge, Misc.MAX_UINT);
      await gauge.connect(user1).updatePeriod(ADDITIONAL_AMOUNT_MYRD);

      // -------------------- advance to the end of the period
      await TimeUtils.advanceBlocksOnTs(7 * 24 * 60 * 60 + 1000);

      // -------------------- claim rewards
      await expect(gauge.connect(user1).getAllRewards(signer)).rejectedWith("Not allowed");
      await gauge.connect(signer).getAllRewards(signer);

      expect(+formatUnits(await myrd.balanceOf(signer))).approximately(
        +formatUnits(ADDITIONAL_AMOUNT_MYRD + PENALTIES_AMOUNT_MYRD),
        1e-8
      );
      expect(+formatUnits(await usdc.balanceOf(signer), 6)).approximately(
        +formatUnits(REWARDS_USDC, 6),
        1e-3
      );
    })
    it("should receive selected rewards if 1/3 of the period is passed", async () => {
      const PENALTIES_AMOUNT_MYRD = parseUnits("5");
      const REWARDS_USDC = parseUnits("100", 6);
      const XMYRD_AMOUNT = parseUnits("20");
      const ADDITIONAL_AMOUNT_MYRD = parseUnits("70");

      // -------------------- let's use mocked xmyrd with predefined penalties amount
      const xmyrdMock = XMyrdMock__factory.connect(await (await deployer.deployContract('XMyrdMock', myrd, gauge)).getAddress(), signer);
      await gauge.init(controller, xmyrdMock, myrd);
      await myrd.mint(xmyrdMock, PENALTIES_AMOUNT_MYRD);

      // -------------------- register USDC as reward token and provide rewards amount
      await gauge.connect(governance).registerRewardToken(xmyrdMock, usdc);
      await usdc.mint(user1, REWARDS_USDC);
      await usdc.connect(user1).approve(gauge, Misc.MAX_UINT);
      await gauge.connect(user1).notifyRewardAmount(usdc, REWARDS_USDC);

      // -------------------- signer receives xmyrd and automatically stakes them
      const xmyrdAsSigner = await DeployUtils.impersonate(await xmyrdMock.getAddress());
      await xmyrdMock.mint(signer, XMYRD_AMOUNT);
      await gauge.connect(xmyrdAsSigner).handleBalanceChange(signer.getAddress());

      // -------------------- provide additional MYRD-rewards
      await myrd.mint(user1, ADDITIONAL_AMOUNT_MYRD);
      await myrd.connect(user1).approve(gauge, Misc.MAX_UINT);
      await gauge.connect(user1).updatePeriod(ADDITIONAL_AMOUNT_MYRD);

      // -------------------- advance on 1/3
      await TimeUtils.advanceBlocksOnTs(7 * 24 * 60 * 60 / 3);

      // -------------------- claim rewards
      await expect(gauge.connect(user1).getReward(signer, [myrd, usdc])).rejectedWith("Not allowed");
      await gauge.connect(signer).getReward(signer, [myrd, usdc]);

      expect(+formatUnits(await myrd.balanceOf(signer))).approximately(
        +formatUnits(ADDITIONAL_AMOUNT_MYRD + PENALTIES_AMOUNT_MYRD) / 3,
        0.001
      );
      expect(+formatUnits(await usdc.balanceOf(signer), 6)).approximately(
        +formatUnits(REWARDS_USDC, 6) / 3,
        0.001
      );
    })
  });
});