import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {MockToken, Vault, VeNFT, VestingLocked, WeightedPool} from '../../typechain';
import { TimeUtils } from '../TimeUtils';
import { ethers } from 'hardhat';
import { DeployerUtils } from '../../scripts/deploy/DeployerUtils';
import {parseUnits} from "ethers";
import {expect} from "chai";

const LOCK_PERIOD = 60 * 60 * 24 * 365 * 4;
const WEEK = 60 * 60 * 24 * 7;

describe('VestingLockedTest', function() {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let owner4: SignerWithAddress;
  let token0: MockToken;
  let token1: MockToken;
  let vault: Vault
  let weightedPool: WeightedPool
  let ve: VeNFT;


  before(async function() {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3, owner4] = await ethers.getSigners();

    token0 = await DeployerUtils.deployMockToken(owner, 'TETU', 18, true);
    token1 = await DeployerUtils.deployMockToken(owner, 'DAI', 18, true);

    const balancerCore = await DeployerUtils.deployBalancer(owner);
    vault = balancerCore.vault

    let tokens = [token0, token1]
    let weights = [parseUnits('0.8'), parseUnits('0.2')]
    let initialBalances = [parseUnits('80000000'), parseUnits('2000000')]
    if (BigInt(await token0.getAddress()) > BigInt(await token1.getAddress())) {
      tokens = [tokens[1], tokens[0]]
      weights = [weights[1], weights[0]]
      initialBalances = [initialBalances[1], initialBalances[0]]
    }

    weightedPool = await DeployerUtils.deployAndInitBalancerWeightedPool(
      owner,
      await vault.getAddress(),
      await balancerCore.protocolFeePercentagesProvider.getAddress(),
      tokens,
      weights,
      // Initially 1 token0 = 10 token1
      initialBalances
    );

    ve = await DeployerUtils.deployContract(owner, 'VeNFT', ...[
      'VeNFT',
      'VeNFT',
      [await weightedPool.getAddress(),],
      [parseUnits('1'),],
    ]) as VeNFT;
    await weightedPool.approve(await ve.getAddress(), parseUnits('1'))
    await ve.createLockFor(await weightedPool.getAddress(), parseUnits('1'), LOCK_PERIOD, owner.address, false);
  });

  after(async function() {
    await TimeUtils.rollback(snapshotBefore);
  });

  beforeEach(async function() {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function() {
    await TimeUtils.rollback(snapshot);
  });

  it('Balancer pool ready', async function() {
    const poolId = await weightedPool.getPoolId()
    const b = await vault.getPoolTokens(poolId)
    expect(b[0][0], await token0.getAddress())
    expect(b[0][1], await token1.getAddress())
  })

  it('vesting with all attributes', async function() {
    const vesting = await DeployerUtils.deployContract(owner, 'VestingLocked', ...[
      WEEK * 4 * 12,
      WEEK * 4 * 3,
      10,
    ]) as VestingLocked;

    await vesting.setVe(await ve.getAddress())

    const amount = parseUnits('1');
    await token0.mint(await vesting.getAddress(), amount);

    await vesting.start(true, await token0.getAddress(), amount,
      [
        owner.address,
        owner2.address,
        owner3.address,
      ],
      [
        parseUnits('0.1'),
        parseUnits('0.1'),
        parseUnits('0.8'),
      ],
    );

    await token1.approve(await vesting.getAddress(), parseUnits('1'))
    await vesting.connect(owner).claim();

  });

});
