import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {MockToken, MYRD__factory, Sale, TokenFactory, TokenFactory__factory, Vesting} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {Misc} from "../../scripts/Misc";
import { DAY } from "../../deploy_helpers/sale.config";
import {expect} from "chai";

const WEEK = 60 * 60 * 24 * 7;
describe('TokenFactoryTest', function() {
  const TEAM_VESTING = 1277 * DAY;
  const TREASURY_VESTING  = 1095 * DAY;
  const REWARDS_VESTING  = 912 * DAY;

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let token: MockToken;
  let sale: Sale;
  let vestingTeam: Vesting;
  let vestingTreasury: Vesting;
  let vestingRewards: Vesting;
  let factory: TokenFactory;


  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    token = await DeployerUtils.deployMockToken(owner, 'TETU', 18, false);

    sale = await DeployerUtils.deployContract(owner, 'Sale', ...[
      owner,
      token,
      1n,
      Math.floor(new Date().getTime() / 1000 + DAY), // now + 1 hour
      Math.floor(new Date().getTime() / 1000 + DAY + 10*DAY),
    ]) as Sale;

    vestingTeam = await DeployerUtils.deployContract(owner, 'Vesting', ...[TEAM_VESTING, 0, 0,]) as Vesting;
    vestingTreasury = await DeployerUtils.deployContract(owner, 'Vesting', ...[TREASURY_VESTING, 0, 0,]) as Vesting;
    vestingRewards = await DeployerUtils.deployContract(owner, 'Vesting', ...[REWARDS_VESTING, 0, 0,]) as Vesting;

    factory = TokenFactory__factory.connect(
      await (await DeployerUtils.deployContract(owner, 'TokenFactory')).getAddress(),
      owner
    );

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

  it("should revert if createToken receives empty address", async () => {
    const bytecode = MYRD__factory.bytecode;

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, ethers.ZeroAddress, sale, vestingTeam, vestingTreasury, vestingRewards)
    ).rejectedWith("empty");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale, ethers.ZeroAddress, vestingTreasury, vestingRewards)
    ).rejectedWith("empty");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale, vestingTeam, ethers.ZeroAddress, vestingRewards)
    ).rejectedWith("empty");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale, vestingTeam, vestingTreasury, ethers.ZeroAddress)
    ).rejectedWith("empty");
  });

  it("should revert if createToken was already called", async () => {
    const bytecode = MYRD__factory.bytecode;

    await factory.createToken(ethers.randomBytes(32), bytecode, owner, sale, vestingTeam, vestingTreasury, vestingRewards);

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale, vestingTeam, vestingTreasury, vestingRewards)
    ).rejectedWith("created");
  });

  it("should revert if _vestingContractTeam has wrong settings", async () => {
    const bytecode = MYRD__factory.bytecode;

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[TEAM_VESTING + 1, 0, 0,]) as Vesting,
        vestingTreasury,
        vestingRewards
      )
    ).rejectedWith("team wrong vesting");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[TEAM_VESTING, 999, 0,]) as Vesting,
        vestingTreasury,
        vestingRewards
      )
    ).rejectedWith("team wrong cliff");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[TEAM_VESTING, 0, 3,]) as Vesting,
        vestingTreasury,
        vestingRewards
      )
    ).rejectedWith("team wrong tge");
  });

  it("should revert if _vestingContractTreasury has wrong settings", async () => {
    const bytecode = MYRD__factory.bytecode;

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        vestingTeam,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[TREASURY_VESTING + 1, 0, 0,]) as Vesting,
        vestingRewards
      )
    ).rejectedWith("treasury wrong vesting");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        vestingTeam,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[TREASURY_VESTING, 999, 0,]) as Vesting,
        vestingRewards
      )
    ).rejectedWith("treasury wrong cliff");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        vestingTeam,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[TREASURY_VESTING, 0, 3,]) as Vesting,
        vestingRewards
      )
    ).rejectedWith("treasury wrong tge");
  });

  it("should revert if _vestingContractRewards has wrong settings", async () => {
    const bytecode = MYRD__factory.bytecode;

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        vestingTeam,
        vestingTreasury,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[REWARDS_VESTING + 1, 0, 0,]) as Vesting,
      )
    ).rejectedWith("rewards wrong vesting");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        vestingTeam,
        vestingTreasury,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[REWARDS_VESTING, 999, 0,]) as Vesting,
      )
    ).rejectedWith("rewards wrong cliff");

    await expect(
      factory.createToken(ethers.randomBytes(32), bytecode, owner, sale,
        vestingTeam,
        vestingTreasury,
        await DeployerUtils.deployContract(owner, 'Vesting', ...[REWARDS_VESTING, 0, 3,]) as Vesting,
      )
    ).rejectedWith("rewards wrong tge");
  });

  it("computeAddress should return correct address", async () => {
    const bytecode = MYRD__factory.bytecode;
    const salt = ethers.randomBytes(32);
    await factory.createToken(salt, bytecode, owner, sale, vestingTeam, vestingTreasury, vestingRewards);

    const computedAddress = await factory.computeAddress(salt, bytecode);
    expect(computedAddress.toLowerCase()).eq((await factory.token()).toLowerCase());
  });
});