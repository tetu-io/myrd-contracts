import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory,
  MockGauge,
  MockGauge__factory,
  MockToken,
  MultiGauge,
  MultiGauge__factory,
  MYRD,
  MYRD__factory,
  StorageLocationChecker,
  StorageLocationChecker__factory,
  XMyrd,
  XMyrd__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {expect} from "chai";
import {Deploy} from "../../scripts/deploy/Deploy";
import {parseUnits} from "ethers";

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

  describe("Normal uses cases", () => {
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

    describe("Enter", () => {
      it("should wrap myrd to xmyrd", async () => {
        expect(await xmyrd.balanceOf(user1)).eq(0);
        expect(await myrd.balanceOf(user1)).eq(AMOUNT);
        expect(await gauge.balanceOf(xmyrd, user1)).eq(0);

        await xmyrd.connect(user1).enter(AMOUNT);

        expect(await xmyrd.balanceOf(user1)).eq(AMOUNT);
        expect(await myrd.balanceOf(user1)).eq(0);
        expect(await gauge.balanceOf(xmyrd, user1)).eq(AMOUNT);
      });

      it("should revert if try to wrap zero amount", async () => {
        await expect(xmyrd.enter(0)).revertedWithCustomError(xmyrd, "IncorrectZeroArgument");
      });
    });

    describe("Exit with penalty", () => {

    });

    describe("Exit with vesting", () => {

    });

    describe("Rebase", () => {

    });

  });
});