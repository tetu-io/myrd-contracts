import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { formatUnits, parseUnits } from 'ethers';
import { ERC20, ERC20__factory, IERC20Metadata__factory, MockToken, VeNFT } from '../../typechain';
import { TimeUtils } from '../TimeUtils';
import { ethers } from 'hardhat';
import { DeployerUtils } from '../../scripts/deploy/DeployerUtils';
import { Misc } from '../../scripts/Misc';
import { expect } from 'chai';

const WEEK = 60 * 60 * 24 * 7;
const LOCK_PERIOD = 60 * 60 * 24 * 365 * 4;
const MAX_LOCK = 60 * 60 * 24 * 365 * 4;

describe('VeNFTTest', function() {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let token1: MockToken;
  let token2: MockToken;
  let token3: MockToken;

  let ve: VeNFT;


  before(async function() {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    token1 = await DeployerUtils.deployMockToken(owner, 'TOKEN1', 18);
    token2 = await DeployerUtils.deployMockToken(owner, 'TOKEN2', 18);
    token3 = await DeployerUtils.deployMockToken(owner, 'TOKEN3', 18);

    ve = await DeployerUtils.deployContract(owner, 'VeNFT', ...[
      'VeNFT',
      'VeNFT',
      [token1, token2],
      [parseUnits('100'), parseUnits('50')],
    ]) as VeNFT;

    await token1.mint(owner2.address, parseUnits('100'));
    await token1.approve(await ve.getAddress(), Misc.MAX_UINT);
    await token1.connect(owner2).approve(await ve.getAddress(), Misc.MAX_UINT);
    await ve.createLockFor(await token1.getAddress(), parseUnits('1'), LOCK_PERIOD, owner.address, false);
    await ve.connect(owner2)
      .createLockFor(await token1.getAddress(), parseUnits('1'), LOCK_PERIOD, owner2.address, false);
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

  it('token length test', async function() {
    expect(await ve.tokensLength()).eq(2);
  });

  it('approve invalid id revert test', async function() {
    await expect(ve.approve(owner2.address, 99)).revertedWithCustomError(ve, 'ERC721NonexistentToken');
  });

  it('approve from not owner revert', async function() {
    await expect(ve.connect(owner2).approve(owner3.address, 1)).revertedWithCustomError(ve,'ERC721InvalidApprover');
  });

  it('mint to zero dst revert test', async function() {
    await expect(ve.createLockFor(await token1.getAddress(), 1, LOCK_PERIOD, Misc.ZERO_ADDRESS, false))
      .revertedWithCustomError(ve,'ERC721InvalidReceiver');
  });


  it('increaseAmount for test', async function() {
    await ve.increaseAmount(await token1.getAddress(), 1, parseUnits('1'));
  });

  it('create lock zero value revert', async function() {
    await expect(ve.createLockFor(await token1.getAddress(), 0, 1, owner.address, false)).revertedWith('WRONG_INPUT');
  });

  it('create lock zero period revert', async function() {
    await expect(ve.createLockFor(await token1.getAddress(), 1, 0, owner.address, false))
      .revertedWith('LOW_LOCK_PERIOD');
  });

  it('create lock too big period revert', async function() {
    await expect(ve.createLockFor(await token1.getAddress(), 1, 1e12, owner.address, false))
      .revertedWith('HIGH_LOCK_PERIOD');
  });

  it('increaseAmount zero value revert', async function() {
    await expect(ve.increaseAmount(await token1.getAddress(), 1, 0)).revertedWith('WRONG_INPUT');
  });

  it('increaseAmount zero value revert', async function() {
    await expect(ve.increaseAmount(await token3.getAddress(), 1, 1)).revertedWith('INVALID_TOKEN');
  });

  it('increaseAmount not locked revert', async function() {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await ve.withdraw(await token1.getAddress(), 1);
    await expect(ve.increaseAmount(await token1.getAddress(), 1, 1)).revertedWith('NFT_WITHOUT_POWER');
  });

  it('increaseAmount expired revert', async function() {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await expect(ve.increaseAmount(await token1.getAddress(), 1, 1)).revertedWith('EXPIRED');
  });

  it('increaseUnlockTime not owner revert', async function() {
    await TimeUtils.advanceBlocksOnTs(WEEK * 10);
    await expect(ve.increaseUnlockTime(2, LOCK_PERIOD)).revertedWith('NOT_OWNER');
  });

  it('increaseUnlockTime lock expired revert', async function() {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await expect(ve.increaseUnlockTime(1, 1)).revertedWith('EXPIRED');
  });

  it('increaseUnlockTime not locked revert', async function() {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD * 2);
    await ve.withdraw(await token1.getAddress(), 1);
    await expect(ve.increaseUnlockTime(1, LOCK_PERIOD)).revertedWith('NOT_OWNER');
  });

  it('increaseUnlockTime zero extend revert', async function() {
    await expect(ve.increaseUnlockTime(1, 0)).revertedWith('LOW_UNLOCK_TIME');
  });

  it('increaseUnlockTime too big extend revert', async function() {
    await expect(ve.increaseUnlockTime(1, 1e12)).revertedWith('HIGH_LOCK_PERIOD');
  });

  it('withdraw not owner revert', async function() {
    await expect(ve.withdraw(await token1.getAddress(), 2)).revertedWith('NOT_OWNER');
  });

  it('merge from revert', async function() {
    await expect(ve.merge(1, 3)).revertedWith('NOT_OWNER');
  });

  it('merge to revert', async function() {
    await expect(ve.merge(3, 1)).revertedWith('NOT_OWNER');
  });

  it('merge same revert', async function() {
    await expect(ve.merge(1, 1)).revertedWith('IDENTICAL_ADDRESS');
  });

  it('split zero percent revert', async function() {
    await expect(ve.split(1, 0)).revertedWith('WRONG_INPUT');
  });

  it('split expired revert', async function() {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);
    await expect(ve.split(1, 1)).revertedWith('EXPIRED');
  });

  it('split withdrew revert', async function() {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);
    await ve.withdraw(await token1.getAddress(), 1);
    await expect(ve.split(1, 1)).revertedWith('NOT_OWNER');
  });

  it('split too low percent revert', async function() {
    await expect(ve.split(1, 1)).revertedWith('LOW_PERCENT');
  });

  it('split not owner revert', async function() {
    await expect(ve.split(3, 1)).revertedWith('NOT_OWNER');
  });

  it('withdraw zero revert', async function() {
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);
    await expect(ve.withdraw(await token2.getAddress(), 1)).revertedWith('ZERO_LOCKED');
  });

  it('withdraw not expired revert', async function() {
    await expect(ve.withdraw(await token1.getAddress(), 1)).revertedWith('NOT_EXPIRED');
  });

  it('balanceOfNFT zero epoch test', async function() {
    expect(await ve.balanceOfNFT(99)).eq(0);
  });

  it('tokenURI for not exist revert', async function() {
    await expect(ve.tokenURI(99)).revertedWithCustomError(ve,'ERC721NonexistentToken');
  });

  it('totalSupplyAt for new block revert', async function() {
    await expect(ve.totalSupplyAt(Date.now() * 10)).revertedWith('WRONG_INPUT');
  });

  it('tokenUri for expired lock', async function() {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 365 * 5);
    expect(await ve.tokenURI(1)).not.eq('');
  });

  it('totalSupplyAt for not exist epoch', async function() {
    expect(await ve.totalSupplyAt(0)).eq(0);
  });

  it('totalSupplyAt for first epoch', async function() {
    const start = (await ve.pointHistory(0)).blk;
    expect(await ve.totalSupplyAt(start)).eq(0);
    expect(await ve.totalSupplyAt(start + 1n)).eq(0);
  });

  it('totalSupplyAtT test', async function() {
    const curBlock = await ethers.provider.getBlockNumber();
    const blockTs = await currentTS(ve);
    expect(curBlock).not.eq(-1);
    expect(blockTs).not.eq(-1);
    const supply = +formatUnits(await ve.totalSupply());
    const supplyBlock = +formatUnits(await ve.totalSupplyAt(curBlock));
    const supplyTsNow = +formatUnits(await ve.totalSupplyAtT(blockTs));
    console.log('supply', supply);
    console.log('supplyBlock', supplyBlock);
    console.log('supplyTsNow', supplyTsNow);

    expect(supply).eq(supplyBlock);
    expect(supplyTsNow).eq(supplyBlock);

    const supplyTs = +formatUnits(await ve.totalSupplyAtT(await currentEpochTS(ve)));
    console.log('supplyTs', supplyTs);

    await checkTotalVeSupplyAtTS(ve, await currentEpochTS(ve) + WEEK);

  });

  it('totalSupplyAt for second epoch', async function() {
    const start = (await ve.pointHistory(1)).blk;
    expect(await ve.totalSupplyAt(start)).not.eq(0);
    expect(await ve.totalSupplyAt(start + 1n)).not.eq(0);
  });

  it('checkpoint for a long period', async function() {
    await TimeUtils.advanceBlocksOnTs(WEEK * 10);
    await ve.checkpoint();
  });

  it('balanceOfNFTAt with history test', async function() {
    const cp0 = (await ve.userPointHistory(2, 0));
    await ve.balanceOfAtNFT(2, cp0.blk);
    const cp1 = (await ve.userPointHistory(2, 1));
    await TimeUtils.advanceNBlocks(1);
    await ve.balanceOfAtNFT(2, cp1.blk + 1n);
  });

  it('supportsInterface test', async function() {
    expect(await ve.supportsInterface('0x00000000')).is.eq(false);
  });

  it('supportsInterface positive test', async function() {
    expect(await ve.supportsInterface('0x01ffc9a7')).is.eq(true);
    expect(await ve.supportsInterface('0x80ac58cd')).is.eq(true);
    expect(await ve.supportsInterface('0x5b5e139f')).is.eq(true);
  });

  it('locked__end test', async function() {
    expect(await ve.lockedEnd(0)).is.eq(0);
  });

  it('balanceOf test', async function() {
    expect(await ve.balanceOf(owner.address)).is.eq(1);
  });

  it('isApprovedForAll test', async function() {
    expect(await ve.isApprovedForAll(owner.address, owner.address)).is.eq(false);
  });

  it('tokenOfOwnerByIndex test', async function() {
    expect(await ve.tokenOfOwnerByIndex(owner.address, 0)).is.eq(1);
  });

  it('setApprovalForAll test', async function() {
    await ve.setApprovalForAll(owner2.address, true);
  });

  it('increase_unlock_time test', async function() {
    await TimeUtils.advanceBlocksOnTs(WEEK * 10);
    await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
    await ve.increaseUnlockTime(1, LOCK_PERIOD);
    await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
    await expect(ve.increaseUnlockTime(1, MAX_LOCK * 2)).revertedWith('HIGH_LOCK_PERIOD');
  });

  // todo
  it.skip('tokenURI test', async function() {
    await ve.createLockFor(await token1.getAddress(), parseUnits('333'), MAX_LOCK, owner.address, false);
    const uri = (await ve.tokenURI(3));
    console.log(uri);
    const base64 = uri.replace('data:application/json;base64,', '');
    console.log(base64);

    const uriJson = Buffer.from(base64, 'base64').toString('binary');
    console.log(uriJson);
    const imgBase64 = JSON.parse(uriJson).image.replace('data:image/svg+xml;base64,', '');
    console.log(imgBase64);
    const svg = Buffer.from(imgBase64, 'base64').toString('binary');
    console.log(svg);
    expect(svg).contains('333');
    // expect(svg).contains('88 days')
  });

  it('balanceOfNFTAt test', async function() {
    // ve #3
    await ve.createLockFor(await token1.getAddress(), parseUnits('100'), LOCK_PERIOD, owner.address, false);
    const tId = 3;

    const blockTsB = await currentTS(ve);
    const blockTs = await currentTS(ve);
    const current = +formatUnits(await ve.balanceOfNFTAt(tId, blockTs));
    console.log('>>> current', current);
    expect(current).approximately(100, 10);
    const zero = +formatUnits(await ve.balanceOfNFTAt(tId, 0));
    const future = +formatUnits(await ve.balanceOfNFTAt(tId, 999_999_999_999));
    const beforeLock = +formatUnits(await ve.balanceOfNFTAt(tId, blockTsB - 1000));
    expect(zero).eq(0);
    expect(future).eq(0);
    expect(beforeLock).eq(0);

    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.increaseAmount(await token1.getAddress(), tId, parseUnits('1000'));

    const blockTsA = await currentTS(ve);
    const beforeLockAfterIncrease = +formatUnits(await ve.balanceOfNFTAt(tId, blockTsA - 1000));
    console.log('>>> beforeLockAfterIncrease', beforeLockAfterIncrease);
    expect(beforeLockAfterIncrease).approximately(98, 10);

    const currentA = +formatUnits(await ve.balanceOfNFTAt(tId, blockTsA));
    console.log('>>> currentA', currentA);
    expect(currentA).approximately(1088, 150);
  });

  it('balanceOfAtNFT test', async function() {
    await TimeUtils.advanceNBlocks(100);
    // ve #3
    await ve.createLockFor(await token1.getAddress(), parseUnits('100'), LOCK_PERIOD, owner.address, false);
    const tId = 3;

    const curBlockB = await ethers.provider.getBlockNumber();


    const curBlock = await ethers.provider.getBlockNumber();
    const current = +formatUnits(await ve.balanceOfAtNFT(tId, curBlock));
    console.log('>>> current', current);
    expect(current).approximately(100, 15);
    const zero = +formatUnits(await ve.balanceOfAtNFT(tId, 0));
    const future = +formatUnits(await ve.balanceOfAtNFT(tId, 999_999_999_999));
    const beforeLock = +formatUnits(await ve.balanceOfAtNFT(tId, curBlockB - 10));
    expect(zero).eq(0);
    expect(future).eq(0);
    expect(beforeLock).eq(0);

    await TimeUtils.advanceNBlocks(100);
    await TimeUtils.advanceBlocksOnTs(WEEK * 2);
    await ve.increaseAmount(await token1.getAddress(), tId, parseUnits('1000'));

    const curBlockA = await ethers.provider.getBlockNumber();
    const beforeLockAfterIncrease = +formatUnits(await ve.balanceOfAtNFT(tId, curBlockA - 10));
    console.log('>>> beforeLockAfterIncrease', beforeLockAfterIncrease);
    expect(beforeLockAfterIncrease).approximately(100, 15);

    const currentA = +formatUnits(await ve.balanceOfAtNFT(tId, curBlockA));
    console.log('>>> currentA', currentA);
    expect(currentA).approximately(1000, 150);
  });

  it('invalid token lock revert', async function() {
    await expect(ve.createLockFor(owner.address, parseUnits('1'), LOCK_PERIOD, owner.address, false))
      .revertedWith('INVALID_TOKEN');
  });

  it('deposit/withdraw test', async function() {
    let balTETU = await token1.balanceOf(owner.address);

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);

    await ve.withdraw(await token1.getAddress(), 1);
    await ve.connect(owner2).withdraw(await token1.getAddress(), 2);

    expect(await token2.balanceOf(await ve.getAddress())).eq(0);
    expect(await token1.balanceOf(await ve.getAddress())).eq(0);

    expect(await token1.balanceOf(owner.address)).eq(balTETU + parseUnits('1'));

    balTETU = await token1.balanceOf(owner.address);
    const balUNDERLYING2 = await token2.balanceOf(owner.address);

    await ve.createLockFor(await token1.getAddress(), parseUnits('0.77'), LOCK_PERIOD, owner.address, false);
    await TimeUtils.advanceNBlocks(5);
    await token2.approve(await ve.getAddress(), Misc.MAX_UINT);
    await ve.increaseAmount(await token2.getAddress(), 3, parseUnits('0.33'));
    expect(await token2.balanceOf(owner.address)).eq(balUNDERLYING2 - parseUnits('0.33'));
    await ve.increaseAmount(await token2.getAddress(), 3, parseUnits('0.37'));
    expect(await token2.balanceOf(owner.address)).eq(balUNDERLYING2 - parseUnits('0.7'));

    expect(formatUnits(await ve.lockedDerivedAmount(3))).eq('1.12');
    expect(+formatUnits(await ve.balanceOfNFT(3))).above(0.6);

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD / 2);

    expect(+formatUnits(await ve.balanceOfNFT(3))).above(0.28); // the actual value is volatile...

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD / 2);

    await ve.withdrawAll(3);

    await expect(ve.ownerOf(3)).revertedWithCustomError(ve, 'ERC721NonexistentToken');

    expect(await token2.balanceOf(await ve.getAddress())).eq(0);
    expect(await token1.balanceOf(await ve.getAddress())).eq(0);

    expect(await token2.balanceOf(owner.address)).eq(balUNDERLYING2);
    expect(await token1.balanceOf(owner.address)).eq(balTETU);
  });

  it('deposit/withdraw in a loop', async function() {
    // clear all locks
    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);
    await ve.withdraw(await token1.getAddress(), 1);
    await ve.connect(owner2).withdraw(await token1.getAddress(), 2);

    // prepare
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 18);
    await token1.mint(owner2.address, parseUnits('1000000000'));
    await token2.mint(owner2.address, parseUnits('1000000000'));
    await token2.approve(await ve.getAddress(), Misc.MAX_UINT);
    await token2.connect(owner2).approve(await ve.getAddress(), Misc.MAX_UINT);

    const balTETUOwner1 = await token1.balanceOf(owner.address);
    const balUNDERLYING2Owner1 = await token2.balanceOf(owner.address);
    const balTETUOwner2 = await token1.balanceOf(owner2.address);
    const balUNDERLYING2Owner2 = await token2.balanceOf(owner2.address);

    const loops = 10;
    const lockDivider = Math.ceil(loops / 3);
    for (let i = 1; i < loops; i++) {
      let stakingToken;
      if (i % 2 === 0) {
        stakingToken = await token1.getAddress();
      } else {
        stakingToken = await token2.getAddress();
      }
      const dec = await IERC20Metadata__factory.connect(stakingToken, owner).decimals();
      const amount = parseUnits('0.123453', dec) * BigInt(i);

      await depositOrWithdraw(
        owner,
        ve,
        stakingToken,
        amount,
        WEEK * Math.ceil(i / lockDivider),
      );
      await depositOrWithdraw(
        owner2,
        ve,
        stakingToken,
        amount,
        WEEK * Math.ceil(i / lockDivider),
      );
      await TimeUtils.advanceBlocksOnTs(WEEK);
    }

    await TimeUtils.advanceBlocksOnTs(LOCK_PERIOD);

    await withdrawIfExist(owner, ve, await token1.getAddress());
    await withdrawIfExist(owner, ve, await token2.getAddress());
    await withdrawIfExist(owner2, ve, await token1.getAddress());
    await withdrawIfExist(owner2, ve, await token2.getAddress());

    expect(await token2.balanceOf(await ve.getAddress())).eq(0);
    expect(await token1.balanceOf(await ve.getAddress())).eq(0);

    expect(await token2.balanceOf(owner.address)).eq(balUNDERLYING2Owner1);
    expect(await token1.balanceOf(owner.address)).eq(balTETUOwner1);
    expect(await token2.balanceOf(owner2.address)).eq(balUNDERLYING2Owner2);
    expect(await token1.balanceOf(owner2.address)).eq(balTETUOwner2);
  });

  it('merge test', async function() {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30);
    await token2.mint(owner.address, parseUnits('100'));
    await token2.approve(await ve.getAddress(), Misc.MAX_UINT);
    await ve.increaseAmount(await token2.getAddress(), 1, parseUnits('1'));

    await ve.createLockFor(await token1.getAddress(), parseUnits('1'), LOCK_PERIOD, owner.address, false);

    const lock3 = await ve.lockedEnd(3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('1.5'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(3, await token1.getAddress())).eq(parseUnits('1'));

    await ve.merge(1, 3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('2.5'));
    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(0);
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(0);
    expect(await ve.lockedAmounts(3, await token1.getAddress())).eq(parseUnits('2'));
    expect(await ve.lockedAmounts(3, await token2.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedEnd(1)).eq(0);
    expect(await ve.lockedEnd(3)).eq(lock3);
  });

  it('split test', async function() {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 30);
    await token2.mint(owner.address, parseUnits('100'));
    await token2.approve(await ve.getAddress(), Misc.MAX_UINT);
    await ve.increaseAmount(await token2.getAddress(), 1, parseUnits('1'));

    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('1.5'));

    await ve.split(1, parseUnits('50'));

    const lock3 = await ve.lockedEnd(3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0.75'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('0.75'));
    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(3, await token1.getAddress())).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(3, await token2.getAddress())).eq(parseUnits('0.5'));

    await ve.merge(1, 3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('1.5'));
    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(0);
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(0);
    expect(await ve.lockedAmounts(3, await token1.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(3, await token2.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedEnd(1)).eq(0);
    expect(await ve.lockedEnd(3)).eq(lock3);
  });

  it('split without 2 und test', async function() {
    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(0);
    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('1'));

    await ve.split(1, parseUnits('50'));

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0.5'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(0);
    expect(await ve.lockedAmounts(3, await token1.getAddress())).eq(parseUnits('0.5'));
    expect(await ve.lockedAmounts(3, await token2.getAddress())).eq(0);
  });

  it('merge without und2 test', async function() {

    await ve.createLockFor(await token1.getAddress(), parseUnits('1'), LOCK_PERIOD, owner.address, false);

    const lock3 = await ve.lockedEnd(3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('1'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(parseUnits('1'));
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(0);
    expect(await ve.lockedAmounts(3, await token1.getAddress())).eq(parseUnits('1'));

    await ve.merge(1, 3);

    expect(await ve.lockedDerivedAmount(1)).eq(parseUnits('0'));
    expect(await ve.lockedDerivedAmount(3)).eq(parseUnits('2'));
    expect(await ve.lockedAmounts(1, await token1.getAddress())).eq(0);
    expect(await ve.lockedAmounts(1, await token2.getAddress())).eq(0);
    expect(await ve.lockedAmounts(3, await token1.getAddress())).eq(parseUnits('2'));
    expect(await ve.lockedAmounts(3, await token2.getAddress())).eq(0);
    expect(await ve.lockedEnd(1)).eq(0);
    expect(await ve.lockedEnd(3)).eq(lock3);
  });

  it('merge with expired should revert test', async function() {

    await ve.createLockFor(await token1.getAddress(), parseUnits('1'), 60 * 60 * 24 * 14, owner.address, false);
    await ve.merge.staticCall(1, 3);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 21);
    await expect(ve.merge(1, 3)).revertedWith('EXPIRED');
  });

  it('create for another should reverted test', async function() {
    await token1.connect(owner2).approve(await ve.getAddress(), parseUnits('10000'));
    await token1.connect(owner3).approve(await ve.getAddress(), parseUnits('10000'));
    expect((await token1.balanceOf(owner2.address)) >= (parseUnits('1'))).eq(true);
    await expect(ve.connect(owner3)
      .createLockFor(await token1.getAddress(), parseUnits('1'), 60 * 60 * 24 * 14, owner2.address, false))
      .revertedWithCustomError(token1, 'ERC20InsufficientBalance');
  });

  // todo fix
  //
  // it('always max lock test', async function() {
  //   await expect(ve.setAlwaysMaxLock(1, false)).revertedWith('WRONG_INPUT');
  //   // align lock time
  //   // await TimeUtils.advanceBlocksOnTs(60 * 60 * 24)
  //   // await ve.increaseUnlockTime(1, MAX_LOCK);
  //
  //   const endOld = (await ve.lockedEnd(1)).toNumber();
  //   const balOld = +formatUnits(await ve.balanceOfNFT(1));
  //   const supplyOld = +formatUnits(await ve.totalSupply());
  //   console.log('old', endOld, balOld, supplyOld, new Date(endOld * 1000));
  //
  //   await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
  //
  //   await ve.setAlwaysMaxLock(1, true);
  //
  //   await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
  //
  //   expect((await ve.additionalTotalSupply()).toString()).eq(parseUnits('1').toString());
  //
  //   const endNew = (await ve.lockedEnd(1)).toNumber();
  //   const balNew = +formatUnits(await ve.balanceOfNFT(1));
  //   const supplyNew = +formatUnits(await ve.totalSupply());
  //   console.log('new', endNew, balNew, supplyNew, new Date(endNew * 1000));
  //
  //   expect(balNew).eq(1);
  //   expect(endNew).eq(await maxLockTime(ve));
  //
  //   await ve.setAlwaysMaxLock(1, false);
  //
  //   console.log('supply after relock', +formatUnits(await ve.totalSupply()));
  //
  //   expect(+formatUnits(await ve.totalSupply())).gt(supplyOld);
  //   expect((await ve.additionalTotalSupply()).toString()).eq('0');
  //
  //   // should be on high level coz we extended time to max lock on disable
  //   expect(+formatUnits(await ve.balanceOfNFT(1))).gt(1 - 0.1);
  //   expect((await ve.lockedEnd(1)).toNumber()).eq(await maxLockTime(ve));
  //
  //   await ve.setAlwaysMaxLock(1, true);
  //
  //   expect((await ve.additionalTotalSupply()).toString()).eq(parseUnits('1').toString());
  //
  //   await ve.increaseAmount(token1.address, 1, parseUnits('1'));
  //
  //   expect(+formatUnits(await ve.totalSupply())).gt(supplyOld + 1);
  //   expect((await ve.additionalTotalSupply()).toString()).eq(parseUnits('2').toString());
  //
  //   await ve.setAlwaysMaxLock(1, false);
  //
  //   expect((await ve.additionalTotalSupply()).toString()).eq('0');
  //   expect(+formatUnits(await ve.totalSupply())).gt(supplyOld + 1);
  //
  //   //// --- after all we should withdraw normally
  //   await TimeUtils.advanceBlocksOnTs(MAX_LOCK);
  //   const tetuBal = await token1.balanceOf(owner.address);
  //   const amnt = await ve.lockedAmounts(1, token1.address);
  //   console.log('amnt', formatUnits(amnt));
  //   expect(+formatUnits(amnt)).eq(2);
  //   await ve.withdrawAll(1);
  //   expect((await token1.balanceOf(owner.address)).sub(tetuBal).toString()).eq(amnt.toString());
  // });
  //
  // it('always max lock relock test', async function() {
  //   await ve.increaseUnlockTime(1, MAX_LOCK);
  //   await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
  //
  //   const oldPower = +formatUnits(await ve.balanceOfNFT(1));
  //   console.log('oldPower', oldPower);
  //   const oldTotal = +formatUnits(await ve.totalSupply());
  //   console.log('oldTotal', oldTotal);
  //
  //   await ve.setAlwaysMaxLock(1, true);
  //   await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
  //
  //   const powerAfterLock = +formatUnits(await ve.balanceOfNFT(1));
  //   console.log('powerAfterLock', powerAfterLock);
  //   const totalAfterLock = +formatUnits(await ve.totalSupply());
  //   console.log('totalAfterLock', totalAfterLock);
  //
  //   await ve.setAlwaysMaxLock(1, false);
  //   await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
  //
  //   const powerAfterLockOff = +formatUnits(await ve.balanceOfNFT(1));
  //   console.log('powerAfterLockOff', powerAfterLockOff);
  //   const totalAfterLockOff = +formatUnits(await ve.totalSupply());
  //   console.log('totalAfterLockOff', totalAfterLockOff);
  //
  //   expect(oldPower).approximately(powerAfterLockOff, 0.001);
  //   expect(oldTotal).approximately(totalAfterLockOff, 0.001);
  // });

});

async function maxLockTime(ve: VeNFT) {
  const now = Number(await ve.blockTimestamp());
  return Math.floor((now) / WEEK) * WEEK + MAX_LOCK;
}


async function depositOrWithdraw(
  owner: SignerWithAddress,
  ve: VeNFT,
  stakingToken: string,
  amount: bigint,
  lock: number,
) {
  await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
  const veIdLength = await ve.balanceOf(owner.address);
  expect(veIdLength).below(2);
  if (veIdLength === 0n) {
    console.log('create lock');
    await ve.connect(owner).createLockFor(stakingToken, amount, lock, owner.address, false);
  } else {
    const veId = await ve.tokenOfOwnerByIndex(owner.address, 0);
    const locked = await ve.lockedAmounts(veId, stakingToken);
    if (locked !== 0n) {
      const lockEnd = Number(await ve.lockedEnd(veId));
      const now = Number(await ve.blockTimestamp());
      if (now >= lockEnd) {
        console.log('withdraw', veId);
        await ve.connect(owner).withdraw(stakingToken, veId);
      } else {
        console.log('lock not ended yet', lockEnd, lockEnd - now, veId);
      }
    } else {
      console.log('no lock for this token');
    }
  }
  await checkTotalVeSupplyAtTS(ve, await currentTS(ve));
}

async function withdrawIfExist(
  owner: SignerWithAddress,
  ve: VeNFT,
  stakingToken: string,
) {
  const veIdLength = await ve.balanceOf(owner.address);
  expect(veIdLength).below(2);
  if (veIdLength !== 0n) {
    const veId = await ve.tokenOfOwnerByIndex(owner.address, 0);
    const locked = await ve.lockedAmounts(veId, stakingToken);
    if (locked !== 0n) {
      const lockEnd = (await ve.lockedEnd(veId));
      const now = (await ve.blockTimestamp());
      if (now >= lockEnd) {
        console.log('withdraw', veId);
        await ve.connect(owner).withdraw(stakingToken, veId);
      }
    }
  }
}

export async function currentEpochTS(ve: VeNFT) {
  const blockTs = await currentTS(ve);
  return Math.floor(blockTs / WEEK) * WEEK;
}

export async function currentTS(ve: VeNFT) {
  return Number(await ve.blockTimestamp());
}

export async function checkTotalVeSupplyAtTS(ve: VeNFT, ts: number) {
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
