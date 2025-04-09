import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {
  Controller,
  Controller__factory, MockGauge,
  MockGauge__factory,
  MockToken, MultiGauge, MultiGauge__factory, StorageLocationChecker, StorageLocationChecker__factory,
  XMyrd,
  XMyrd__factory
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
    await gauge.init(controller, xmyrd, myrd);
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
      await expect(gauge.init(governance, xmyrd, myrd)).revertedWithCustomError(controller, "InvalidInitialization");
    });
  });

});