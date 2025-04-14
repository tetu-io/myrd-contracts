import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory, ControllerToUpgrade__factory, IProxyControlled__factory, MockGauge,
  MockGauge__factory,
  MockToken, StorageLocationChecker, StorageLocationChecker__factory,
  XMyrd,
  XMyrd__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {expect} from "chai";
import {Deploy} from "../../scripts/deploy/Deploy";
import {parseUnits} from "ethers";
import {DeployUtils} from "../utils/DeployUtils";

describe('XMyrdTest', function() {
  let snapshotBefore: string;
  let snapshot: string;

  let deployer: Deploy;

  let signer: SignerWithAddress;
  let governance: SignerWithAddress;
  let storageLocationChecker: StorageLocationChecker;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let controller: Controller;
  let xmyrd: XMyrd;
  let myrd: MockToken;
  let gauge: MockGauge;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, governance, user1, user2] = await ethers.getSigners();

    deployer = new Deploy(governance);
    controller = Controller__factory.connect(await deployer.deployProxyForTests('Controller'), signer);
    xmyrd = XMyrd__factory.connect(await deployer.deployProxyForTests('XMyrd'), signer);
    myrd = await DeployerUtils.deployMockToken(signer, 'MYRD', 18, false);
    gauge = MockGauge__factory.connect(await (await DeployerUtils.deployContract(signer, "MockGauge")).getAddress(), signer);
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
    it("check XMYRD_STORAGE_LOCATION constant", async () => {
      const location = await storageLocationChecker.getXMyrdStorageLocation();
      console.log(location);
      expect(location).eq("0xf0ecfc0ccecc6975572b37fa830af6559e5857b63ecd7cc8ae9394138d3fd700");
    });
    it("check XMYRD_STORAGE_LOCATION calculations", async () => {
      const location = await storageLocationChecker.getStorageLocation("erc7201:myrd.XMyrd");
      expect(location).eq("0xf0ecfc0ccecc6975572b37fa830af6559e5857b63ecd7cc8ae9394138d3fd700");
    });
    // we don't test getXMyrdLibStorage because there is no XMyrdLib
    it("should revert if call init second time", async () => {
      await expect(xmyrd.initialize(governance, myrd, gauge)).revertedWithCustomError(controller, "InvalidInitialization");
    });
  });

  describe("View", () => {
    it("should return expected myrd value", async () => {
      expect((await xmyrd.myrd()).toLowerCase()).eq((await myrd.getAddress()).toLowerCase());
    });
    it("should return expected gauge value", async () => {
      expect((await xmyrd.gauge()).toLowerCase()).eq((await gauge.getAddress()).toLowerCase());
    });
    it("should return expected constants", async () => {
      expect(await xmyrd.BASIS()).eq(10_000n);
      expect(await xmyrd.SLASHING_PENALTY()).eq(5_000n);
      expect(await xmyrd.MIN_VEST()).eq(14*24*60*60);
      expect(await xmyrd.MAX_VEST()).eq(180*24*60*60);
    });
  });

  describe("Transfer XMyrd / setExemption", () => {
    const AMOUNT = parseUnits("1");
    let snapshot1: string;
    before(async function () {
      snapshot1 = await TimeUtils.snapshot();

      // wrap myrd => xmyrd
      await myrd.mint(user1, AMOUNT);
      await myrd.connect(user1).approve(xmyrd, AMOUNT);
      await xmyrd.connect(user1).enter(AMOUNT);
    });
    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    it("should have xmyrd on balance", async () => {
      expect(await xmyrd.balanceOf(user1)).eq(AMOUNT);
    })

    it("shouldn't allow to transfer xmyrd", async () => {
      await expect(xmyrd.connect(user1).transfer(user2, AMOUNT)).revertedWithCustomError(xmyrd, "NOT_WHITELISTED");
    });

    describe("setExemptionFrom", () => {
      it("should allow to add and remove the address  is in the exempt-from list", async () => {
        // ----------------- not exempted
        await expect(xmyrd.connect(user1).transfer(user2, AMOUNT)).revertedWithCustomError(xmyrd, "NOT_WHITELISTED");

        // ----------------- add user1 to the exempted-from list
        await xmyrd.connect(governance).setExemptionFrom([user1], [true]);
        await xmyrd.connect(user1).transfer(user2, AMOUNT);

        expect(await xmyrd.balanceOf(user1)).eq(0);
        expect(await xmyrd.balanceOf(user2)).eq(AMOUNT);

        // ----------------- remove user1 from the exempted-from list
        await xmyrd.connect(governance).setExemptionFrom([user1], [false]);

        await myrd.mint(user1, AMOUNT);
        await myrd.connect(user1).approve(xmyrd, AMOUNT);

        await expect(xmyrd.connect(user1).transfer(user2, AMOUNT)).revertedWithCustomError(xmyrd, "NOT_WHITELISTED");
      });

      it("should allow to transfer xmyrd if the sender is in the exempt-from list", async () => {
        await xmyrd.connect(governance).setExemptionFrom([user1], [true]);
        await xmyrd.connect(user1).transfer(user2, AMOUNT);

        expect(await xmyrd.balanceOf(user1)).eq(0);
        expect(await xmyrd.balanceOf(user2)).eq(AMOUNT);
      });

      it("should NOT allow to transfer xmyrd if the receiver is in the exempt-FROM list", async () => {
        await xmyrd.connect(governance).setExemptionFrom([user2], [true]);
        await expect(xmyrd.connect(user1).transfer(user2, AMOUNT)).revertedWithCustomError(xmyrd, "NOT_WHITELISTED");
      });

      it("should revert if lengths mismatch", async () => {
        await expect(
          xmyrd.connect(governance).setExemptionFrom([user1, user2], [true])
        ).revertedWithCustomError(xmyrd, "IncorrectArrayLength");
        await expect(
          xmyrd.connect(governance).setExemptionFrom([], [true])
        ).revertedWithCustomError(xmyrd, "IncorrectArrayLength");
      });

      it("should revert if not governance", async () => {
        await expect(xmyrd.connect(user2).setExemptionFrom([user1], [true])).revertedWithCustomError(xmyrd, "NotGovernance");
      });
    });

    describe("setExemptionTo", () => {
      it("should allow to transfer xmyrd if the receiver is in the exempt-to list", async () => {
        // ----------------- not exempted
        await expect(xmyrd.connect(user1).transfer(user2, AMOUNT)).revertedWithCustomError(xmyrd, "NOT_WHITELISTED");

        // ----------------- add user2 to the exempted-to list
        await xmyrd.connect(governance).setExemptionTo([user2], [true]);
        await xmyrd.connect(user1).transfer(user2, AMOUNT);

        expect(await xmyrd.balanceOf(user1)).eq(0);
        expect(await xmyrd.balanceOf(user2)).eq(AMOUNT);

        // ----------------- remove user2 from the exempted-to list
        await xmyrd.connect(governance).setExemptionTo([user2], [false]);

        await myrd.mint(user1, AMOUNT);
        await myrd.connect(user1).approve(xmyrd, AMOUNT);

        await expect(xmyrd.connect(user1).transfer(user2, AMOUNT)).revertedWithCustomError(xmyrd, "NOT_WHITELISTED");
      });

      it("should NOT allow to transfer xmyrd if the sender is in the exempt-TO list", async () => {
        await xmyrd.connect(governance).setExemptionTo([user1], [true]);
        await expect(xmyrd.connect(user1).transfer(user2, AMOUNT)).revertedWithCustomError(xmyrd, "NOT_WHITELISTED");
      });

      it("should revert if lengths mismatch", async () => {
        await expect(
          xmyrd.connect(governance).setExemptionTo([user1, user2], [true])
        ).revertedWithCustomError(xmyrd, "IncorrectArrayLength");
        await expect(
          xmyrd.connect(governance).setExemptionTo([], [true])
        ).revertedWithCustomError(xmyrd, "IncorrectArrayLength");
      });

      it("should revert if not governance", async () => {
        await expect(xmyrd.connect(user2).setExemptionTo([user1], [true])).revertedWithCustomError(xmyrd, "NotGovernance");
      });
    });

  });

  describe("updateProxies", () => {
    it("should update controller implementation", async () => {
      // set deployer controller
      const deployer1 = await DeployUtils.impersonate(ethers.Wallet.createRandom().address);
      await controller.connect(governance).changeDeployer(deployer1, false);

      expect((await controller.governance()).toLowerCase()).eq(governance.address.toLowerCase());
      expect(await controller.isDeployer(deployer1)).eq(true);

      const proxy = await IProxyControlled__factory.connect(await xmyrd.getAddress(), signer);
      const oldImpl = await proxy.implementation();

      // deploy "new XMyrd implementation"
      const newImpl = await (await deployer.deployContract('XMyrd')).getAddress();

      // update xmyrd proxy
      await controller.connect(deployer1).updateProxies([await xmyrd.getAddress()], newImpl);

      // ensure that we can read all data from the xmyrd as before
      expect((await xmyrd.controller()).toLowerCase()).eq((await controller.getAddress()).toLowerCase());

      const proxy2 = await IProxyControlled__factory.connect(await xmyrd.getAddress(), signer);
      expect((await proxy2.implementation()).toLowerCase()).eq(newImpl.toLowerCase());
      expect((await proxy2.implementation()).toLowerCase()).not.eq(oldImpl.toLowerCase());
    });
  });
});