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

describe('GaugeFTest', function() {
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
  let tokenFactory: TokenFactory;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [signer, user1, user2, user3] = await ethers.getSigners();


    await hre.deployments.fixture([
      "AllCoreProxies",
      "TokenFactory",
      "Vesting",
      "Sale",
      "MYRD",
    ]);

    // ------------------------ get deployed addresses
    const tokenFactoryTemp = TokenFactory__factory.connect(await getDeployedContractByName("TokenFactory", true), user1);
    const gov = await DeployUtils.impersonate(await tokenFactoryTemp.governance());
    tokenFactory = TokenFactory__factory.connect(await getDeployedContractByName("TokenFactory", true), gov);
    myrd = MYRD__factory.connect(await tokenFactory.token(), gov);

    controller = Controller__factory.connect(await getDeployedContractByName("ControllerProxy", true), gov);
    xmyrd = XMyrd__factory.connect(await getDeployedContractByName("XMyrdProxy", true), gov);
    gauge = MultiGauge__factory.connect(await getDeployedContractByName("MultiGaugeProxy", true), gov);
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

  describe("Normal uses cases", () => {
    it("should return expected values", async () => {
      // todo
    });
  });
});