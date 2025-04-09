import {parseUnits} from "ethers";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory,
  MockToken,
  StorageLocationChecker,
  StorageLocationChecker__factory
} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {expect} from "chai";
import {Deploy} from "../../scripts/deploy/Deploy";

describe('ControllerTest', function() {
  const INIT_PAY_AMOUNT = parseUnits("1000000000000000000");

  let snapshotBefore: string;
  let snapshot: string;

  let deployer: Deploy;

  let signer: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let storageLocationChecker: StorageLocationChecker;
  let controller: Controller;

  let payToken: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, governance, user1, user2, user3] = await ethers.getSigners();

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

  describe("misc", () => {
    it("check CONTROLLER_STORAGE_LOCATION constant", async () => {
      const location = await storageLocationChecker.getControllerStorageLocation();
      console.log(location);
      expect(location).eq("0x57c91c9d2d1b16abfafd64a2fd64e4c5a29df6dd57817b6005a3cfaeabe23d00");
    });
    it("check CONTROLLER_STORAGE_LOCATION calculations", async () => {
      const location = await storageLocationChecker.getStorageLocation("myrd.controller");
      expect(location).eq("0x57c91c9d2d1b16abfafd64a2fd64e4c5a29df6dd57817b6005a3cfaeabe23d00");
    });
    it("check getControllerLibStorage", async () => {
      const location = await storageLocationChecker.getControllerLibStorage();
      expect(location).eq(BigInt("0x57c91c9d2d1b16abfafd64a2fd64e4c5a29df6dd57817b6005a3cfaeabe23d00"));
    });
    it("should revert if call init second time", async () => {
      await expect(controller.init(governance)).revertedWithCustomError(controller, "InvalidInitialization");
    });
  });
});