import {parseUnits} from "ethers";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {MockToken} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";

describe('XMyrdFTest', function() {
  const INIT_PAY_AMOUNT = parseUnits("1000000000000000000");

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  let payToken: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, governance, user1, user2, user3] = await ethers.getSigners();

    payToken = await DeployerUtils.deployMockToken(owner, 'PAY', 6, false);
    tokenToSale = await DeployerUtils.deployMockToken(owner, 'SALE', 18, false);

    await payToken.mint(user1, INIT_PAY_AMOUNT);
    await payToken.mint(user2, INIT_PAY_AMOUNT);
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


});