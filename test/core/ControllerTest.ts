import {parseUnits} from "ethers";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory, ControllerToUpgrade__factory, IProxyControlled__factory,
  MockToken,
  StorageLocationChecker,
  StorageLocationChecker__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {expect} from "chai";
import {Deploy} from "../../scripts/deploy/Deploy";
import {DeployUtils} from "../utils/DeployUtils";

describe('ControllerTest', function() {
  let snapshotBefore: string;
  let snapshot: string;

  let deployer: Deploy;

  let signer: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let storageLocationChecker: StorageLocationChecker;
  let controller: Controller;

  let payToken: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, governance, user1] = await ethers.getSigners();

    deployer = new Deploy(governance);
    storageLocationChecker = StorageLocationChecker__factory.connect(await (await deployer.deployContract('StorageLocationChecker')).getAddress(), signer);
    controller = Controller__factory.connect(await deployer.deployProxyForTests('Controller'), signer);

    await controller.init(governance);
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
    it("check CONTROLLER_STORAGE_LOCATION constant", async () => {
      const location = await storageLocationChecker.getControllerStorageLocation();
      console.log(location);
      expect(location).eq("0x4c6450c977215891cc3be3fa519a5e16bed895db738a774c07512a1e9245d300");
    });
    it("check CONTROLLER_STORAGE_LOCATION calculations", async () => {
      const location = await storageLocationChecker.getStorageLocation("erc7201:myrd.Controller");
      expect(location).eq("0x4c6450c977215891cc3be3fa519a5e16bed895db738a774c07512a1e9245d300");
    });
    it("check getControllerLibStorage", async () => {
      const location = await storageLocationChecker.getControllerLibStorage();
      expect(location).eq(BigInt("0x4c6450c977215891cc3be3fa519a5e16bed895db738a774c07512a1e9245d300"));
    });
    it("should revert if call init second time", async () => {
      await expect(controller.init(governance)).revertedWithCustomError(controller, "InvalidInitialization");
    });
  });

  describe("view", () => {
    it("governance should return expected value", async () => {
      expect((await controller.governance()).toLowerCase()).eq(governance.address.toLowerCase());
    });
    it("isController should return expected value", async () => {
      expect(await controller.isController(controller)).eq(true);
    });
    it("governance is deployer", async () => {
      expect(await controller.isDeployer(await controller.governance())).eq(true);
    });
  });

  describe("changeDeployer", () => {
    it("should return correct deployers", async () => {
      const deployer1 = ethers.Wallet.createRandom();
      const deployer2 = ethers.Wallet.createRandom();

      expect(await controller.isDeployer(deployer1)).eq(false);
      expect(await controller.isDeployer(deployer2)).eq(false);

      await controller.connect(governance).changeDeployer(deployer1, false);
      await controller.connect(governance).changeDeployer(deployer2, true);

      expect(await controller.isDeployer(deployer1)).eq(true);
      expect(await controller.isDeployer(deployer2)).eq(false);

      await controller.connect(governance).changeDeployer(deployer2, false);

      expect(await controller.isDeployer(deployer1)).eq(true);
      expect(await controller.isDeployer(deployer2)).eq(true);

      await controller.connect(governance).changeDeployer(deployer1, true);
      await controller.connect(governance).changeDeployer(deployer2, true);

      expect(await controller.isDeployer(deployer1)).eq(false);
      expect(await controller.isDeployer(deployer2)).eq(false);
    });

    it("should revert if not governance", async () => {
      await expect(
        controller.connect(user1).changeDeployer(user1, true)
      ).revertedWithCustomError(controller, "NotGovernance");
    });
  });

  describe("updateProxies", () => {
    it("should update controller implementation", async () => {
      // set some data in the controller
      const deployer1 = await DeployUtils.impersonate(ethers.Wallet.createRandom().address);
      await controller.connect(governance).changeDeployer(deployer1, false);

      expect((await controller.governance()).toLowerCase()).eq(governance.address.toLowerCase());
      expect(await controller.isDeployer(deployer1)).eq(true);

      const proxy = await IProxyControlled__factory.connect(await controller.getAddress(), signer);
      const oldImpl = await proxy.implementation();

      // deploy "new controller implementation"
      const newImpl = await (await deployer.deployContract('ControllerToUpgrade')).getAddress();

      // update controller itself
      await controller.connect(deployer1).updateProxies([await controller.getAddress()], newImpl);

      // ensure that we can read all data from the controller as before
      expect((await controller.governance()).toLowerCase()).eq(governance.address.toLowerCase());
      expect(await controller.isDeployer(deployer1)).eq(true);

      const proxy2 = await IProxyControlled__factory.connect(await controller.getAddress(), signer);
      expect((await proxy2.implementation()).toLowerCase()).eq(newImpl.toLowerCase());
      expect((await proxy2.implementation()).toLowerCase()).not.eq(oldImpl.toLowerCase());

      // ensure that we can read new properties from the controller
      expect(
        await ControllerToUpgrade__factory.connect(await controller.getAddress(), signer).NEW_CONSTANT()
      ).eq("1");
    });

    it("should revert if not deployer", async () => {
      // deploy "new controller implementation"
      const newImpl = await (await deployer.deployContract('ControllerToUpgrade')).getAddress();

      await expect(
        controller.connect(user1).updateProxies([await controller.getAddress()], newImpl)
      ).revertedWithCustomError(controller, "NotDeployer");
    });
  });
});