import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockToken, VeDistributor, VeDistributor__factory, VeNFT } from '../../typechain';
import { TimeUtils } from '../TimeUtils';
import { ethers } from 'hardhat';
import { DeployerUtils } from '../../scripts/deploy/DeployerUtils';
import { formatUnits, parseUnits, Result } from 'ethers';
import { Misc } from '../../scripts/Misc';
import { expect } from 'chai';


const checkpointEvent = VeDistributor__factory.createInterface().getEvent('Checkpoint');
const LOCK_PERIOD = 60 * 60 * 24 * 365 * 4;
const WEEK = 60 * 60 * 24 * 7;

describe('VeDistributorTest', function() {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let token: MockToken;

  let ve: VeNFT;
  let veDist: VeDistributor;


  before(async function() {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    token = await DeployerUtils.deployMockToken(owner, 'TETU', 18);
    ve = await DeployerUtils.deployContract(owner, 'VeNFT', ...[
      'VeNFT',
      'VeNFT',
      [token],
      [parseUnits('100')],
    ]) as VeNFT;

    veDist = await DeployerUtils.deployContract(owner, 'VeDistributor', ...[
      await ve.getAddress(),
      await token.getAddress(),
    ]) as VeDistributor;

    await token.mint(owner2.address, parseUnits('100'));
    await token.approve(await ve.getAddress(), Misc.MAX_UINT);
    await token.connect(owner2).approve(await ve.getAddress(), Misc.MAX_UINT);
    await ve.createLockFor(await token.getAddress(), parseUnits('1'), LOCK_PERIOD, owner.address, false);
    await ve.connect(owner2)
      .createLockFor(await token.getAddress(), parseUnits('1'), LOCK_PERIOD, owner2.address, false);
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

  it('distribute and claim', async function() {
    expect(await startNewEpoch(ve, veDist)).eq(false);
    // need to wait for make sure everyone has powers at epoch start
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    // check pre conditions
    expect((await veDist.claimable(1))).eq(0n);
    expect((await veDist.claimable(2))).eq(0n);
    console.log('precheck is fine');

    // empty claim
    await veDist.claimMany([1]);

    // --- NEW EPOCH

    await token.transfer(await veDist.getAddress(), parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch())).eq(1n);

    expect(+formatUnits(await veDist.claimable(1))).eq(50);
    expect(+formatUnits(await veDist.claimable(2))).eq(50);

    await veDist.claimMany([1]);
    await expect(veDist.claimMany([2])).revertedWith('not owner');
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await token.balanceOf(await veDist.getAddress()))).approximately(0, 0.00000000000000001);

    // --- NEW EPOCH

    expect(await startNewEpoch(ve, veDist)).eq(false);

    await token.transfer(await veDist.getAddress(), parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(false);

    await TimeUtils.advanceBlocksOnTs(WEEK);
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch())).eq(2);

    expect(+formatUnits(await veDist.claimable(1))).eq(50);
    expect(+formatUnits(await veDist.claimable(2))).eq(50);

    await veDist.claimMany([1]);
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await token.balanceOf(await veDist.getAddress()))).approximately(0, 0.00000000000000001);

    // --- NEW EPOCH

    await TimeUtils.advanceBlocksOnTs(WEEK);
    await token.transfer(await veDist.getAddress(), parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch())).eq(3);

    expect(+formatUnits(await veDist.claimable(1))).approximately(50, 5);
    expect(+formatUnits(await veDist.claimable(2))).approximately(50, 5);

    await veDist.claimMany([1]);
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await token.balanceOf(await veDist.getAddress()))).approximately(0, 0.00000000000000001);

    // --- NEW EPOCH

    await TimeUtils.advanceBlocksOnTs(WEEK * 4);
    await token.transfer(await veDist.getAddress(), parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch())).eq(4);

    expect(+formatUnits(await veDist.claimable(1))).approximately(50, 5);
    expect(+formatUnits(await veDist.claimable(2))).approximately(50, 5);

    await veDist.claimMany([1]);
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await token.balanceOf(await veDist.getAddress()))).approximately(0, 0.00000000000000001);

    // --- NEW EPOCH

    await ve.connect(owner2).increaseAmount(await token.getAddress(), 2, parseUnits('10'));

    await TimeUtils.advanceBlocksOnTs(WEEK);
    await token.transfer(await veDist.getAddress(), parseUnits('100'));
    expect(await startNewEpoch(ve, veDist)).eq(true);

    expect((await veDist.epoch())).eq(5);

    expect(+formatUnits(await veDist.claimable(1))).approximately(8, 5);
    expect(+formatUnits(await veDist.claimable(2))).approximately(91, 5);

    await veDist.claimMany([1]);
    await veDist.connect(owner2).claimMany([2]);

    expect(+formatUnits(await token.balanceOf(await veDist.getAddress()))).approximately(0, 0.000000000000001);

  });

});


async function startNewEpoch(ve: VeNFT, veDist: VeDistributor): Promise<boolean> {
  const oldEpoch = await veDist.epoch();

  const prevEpochTs = (await veDist.epochInfos(oldEpoch)).ts;
  console.log('prevEpochTs', prevEpochTs);
  const curTs = await currentEpochTS(ve);
  console.log('curTs', curTs);


  const checkpointTx = await (await veDist.startNewEpoch()).wait();

  let checkpoint: Result | undefined = undefined;
  for (const event of checkpointTx?.logs ?? []) {
    if (event.topics[0] !== checkpointEvent.topicHash) {
      continue;
    }
    checkpoint = VeDistributor__factory.createInterface()
      .decodeEventLog(checkpointEvent, event.data, event.topics);
  }
  if (!checkpoint) {
    return false;
  }

  console.log('checkpoint epoch', checkpoint.epoch);
  console.log('checkpoint newEpochTs', checkpoint.newEpochTs);
  console.log('checkpoint tokenBalance', formatUnits(checkpoint.tokenBalance));
  console.log('checkpoint prevTokenBalance', formatUnits(checkpoint.prevTokenBalance));
  console.log('checkpoint tokenDiff', formatUnits(checkpoint.tokenDiff));
  console.log('checkpoint rewardsPerToken', formatUnits(checkpoint.rewardsPerToken));
  console.log('checkpoint veTotalSupply', formatUnits(checkpoint.veTotalSupply));

  expect(curTs).eq(checkpoint.newEpochTs);

  await checkTotalVeSupplyAtTS(ve, curTs);

  return oldEpoch + 1n === (checkpoint.epoch);
}

export async function currentEpochTS(ve: VeNFT) {
  const blockTs = await currentTS(ve);
  return Math.floor(blockTs / WEEK) * WEEK;
}

export async function currentTS(ve: VeNFT) {
  return Number(await ve.blockTimestamp());
}


async function checkTotalVeSupplyAtTS(ve: VeNFT, ts: number) {
  await ve.checkpoint();

  console.log('additionalTotalSupply', formatUnits(await ve.additionalTotalSupply()));

  const total = +formatUnits(await ve.totalSupplyAtT(ts));
  console.log('total', total);
  const nftCount = Number(await ve.nftCount());

  let sum = 0;
  for (let i = 1; i <= nftCount; ++i) {
    const bal = +formatUnits(await ve.balanceOfNFTAt(i, ts));
    console.log('bal', i, bal);
    sum += bal;
  }
  console.log('sum', sum);
  expect(sum).approximately(total, 0.0000000000001);
  console.log('total supply is fine');
}
