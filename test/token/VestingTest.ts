import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockToken, Vesting } from '../../typechain';
import { TimeUtils } from '../TimeUtils';
import { ethers } from 'hardhat';
import { DeployerUtils } from '../../scripts/deploy/DeployerUtils';
import { parseUnits } from 'ethers';
import { expect } from 'chai';

const WEEK = 60 * 60 * 24 * 7;

describe('VestingTest', function() {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let token: MockToken;


  before(async function() {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    token = await DeployerUtils.deployMockToken(owner, 'TETU', 18, false);
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

  it('vesting with all attributes', async function() {
    const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[
      WEEK * 4 * 12,
      WEEK * 4 * 3,
      10,
    ]) as Vesting;

    const amount = 10000;
    await token.mint(await vesting.getAddress(), amount);

    await vesting.start(true, await token.getAddress(), amount,
      [
        owner.address,
        owner2.address,
        owner3.address,
      ],
      [
        1000,
        1000,
        8000,
      ],
    );


    expect(await token.balanceOf(owner.address)).is.eq(0);
    expect(await token.balanceOf(owner2.address)).is.eq(0);
    expect(await token.balanceOf(owner3.address)).is.eq(0);
    expect(await token.balanceOf(await vesting.getAddress())).is.eq(10000);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(100);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(100);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(800);

    await vesting.connect(owner).claim();
    await vesting.connect(owner2).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(100);
    expect(await token.balanceOf(owner2.address)).is.eq(100);
    expect(await token.balanceOf(owner3.address)).is.eq(800);

    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 9);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(450);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(450);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(3600);

    await vesting.connect(owner).claim();
    await vesting.connect(owner2).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(550);
    expect(await token.balanceOf(owner2.address)).is.eq(550);
    expect(await token.balanceOf(owner3.address)).is.eq(4400);

    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(449);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(449);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(3599);

    await vesting.connect(owner).claim();
    await vesting.connect(owner2).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(999);
    expect(await token.balanceOf(owner2.address)).is.eq(999);
    expect(await token.balanceOf(owner3.address)).is.eq(7999);
    expect(await token.balanceOf(await vesting.getAddress())).is.eq(3);
  });

  it('vesting with all attributes, one late claim', async function() {
    const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[
      WEEK * 4 * 12,
      WEEK * 4 * 3,
      10,
    ]) as Vesting;

    const amount = 10000;
    await token.mint(await vesting.getAddress(), amount);

    await vesting.start(true, await token.getAddress(), amount,
      [
        owner.address,
        owner2.address,
        owner3.address,
      ],
      [
        1000,
        1000,
        8000,
      ],
    );


    expect(await token.balanceOf(owner.address)).is.eq(0);
    expect(await token.balanceOf(owner2.address)).is.eq(0);
    expect(await token.balanceOf(owner3.address)).is.eq(0);
    expect(await token.balanceOf(await vesting.getAddress())).is.eq(10000);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(100);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(100);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(800);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(100);
    expect(await token.balanceOf(owner3.address)).is.eq(800);

    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 9);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(450);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(550);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(3600);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(550);
    expect(await token.balanceOf(owner3.address)).is.eq(4400);

    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(449);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(1000);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(3599);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(999);
    expect(await token.balanceOf(owner3.address)).is.eq(7999);


    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner2.address)).amount).is.eq(1000);

    await vesting.connect(owner2).claim();

    expect(await token.balanceOf(owner2.address)).is.eq(1000);
    expect(await token.balanceOf(await vesting.getAddress())).is.eq(2);
  });

});
