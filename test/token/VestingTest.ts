import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockToken, Vesting } from '../../typechain';
import { TimeUtils } from '../utils/TimeUtils';
import { ethers } from 'hardhat';
import { DeployerUtils } from '../../scripts/deploy/DeployerUtils';
import {formatUnits, parseUnits} from 'ethers';
import { expect } from 'chai';
import {DeployUtils} from "../utils/DeployUtils";
import {DAY} from "../../deploy_helpers/sale.config";

const WEEK = 60 * 60 * 24 * 7;

describe('VestingTest', function() {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let token: MockToken;
  let user4: SignerWithAddress;
  let user5: SignerWithAddress;
  let user6: SignerWithAddress;
  let user7: SignerWithAddress;


  before(async function() {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3, user4, user5, user6, user7] = await ethers.getSigners();

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
      WEEK * 4 * 12, // vesting period
      WEEK * 4 * 3, // cliff period
      10, // tge percent
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

    // ----------------------- claim TGE
    expect((await vesting.toClaim(owner.address)).amount).is.eq(100);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(100);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(800);

    await vesting.connect(owner).claim();
    await vesting.connect(owner2).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(100);
    expect(await token.balanceOf(owner2.address)).is.eq(100);
    expect(await token.balanceOf(owner3.address)).is.eq(800);

    // ----------------------- pass cliff period + half of the vesting period
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

    // ----------------------- pass whole vesting period
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(450);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(450);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(3600);

    await vesting.connect(owner).claim();
    await vesting.connect(owner2).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(1000);
    expect(await token.balanceOf(owner2.address)).is.eq(1000);
    expect(await token.balanceOf(owner3.address)).is.eq(8000);
    expect(await token.balanceOf(await vesting.getAddress())).is.eq(0);
  });

  it('vesting with all attributes, one late claim', async function() {
    const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[
      WEEK * 4 * 12, // vesting
      WEEK * 4 * 3,  // cliff
      10, // tge
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

    // ----------------------- owners 1 and 3 claim TGE, owner 2 doesn't
    expect((await vesting.toClaim(owner.address)).amount).is.eq(100);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(100);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(800);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(100);
    expect(await token.balanceOf(owner3.address)).is.eq(800);

    // ----------------------- pass cliff period + half of the vesting period
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 9);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(450);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(550);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(3600);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(550);
    expect(await token.balanceOf(owner3.address)).is.eq(4400);

    // ----------------------- pass whole vesting period
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(450);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(1000);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(3600);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(1000);
    expect(await token.balanceOf(owner3.address)).is.eq(8000);

    // ----------------------- pass additional 6 weeks, now owner 2 claims all
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner2.address)).amount).is.eq(1000);

    await vesting.connect(owner2).claim();

    expect(await token.balanceOf(owner2.address)).is.eq(1000);
    expect(await token.balanceOf(await vesting.getAddress())).is.eq(0);
  });

  it('vesting without tge', async function() {
    const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[
      WEEK * 4 * 12, // period
      WEEK * 4 * 3, // cliff
      0, // no tge
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

    expect((await vesting.toClaim(owner.address)).amount).is.eq(0);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(0);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(0);

    // ----------------------- pass cliff period + 1 of 12 months of the vesting period
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 4);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(83);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(83);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(666);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(83);
    expect(await token.balanceOf(owner3.address)).is.eq(666);

    // ----------------------- pass 10 of 12 months of the vesting period
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 9);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(750);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(833);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(6000);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(833);
    expect(await token.balanceOf(owner3.address)).is.eq(6666);

    // ----------------------- pass additional 2 months of vesting period + additional 4 months
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(167);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(1000);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(1334);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(1000);
    expect(await token.balanceOf(owner3.address)).is.eq(8000);

    // ----------------------- pass additional 4 months
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner2.address)).amount).is.eq(1000);

    await vesting.connect(owner2).claim();

    expect(await token.balanceOf(owner2.address)).is.eq(1000);
    expect(await token.balanceOf(await vesting.getAddress())).is.eq(0);
  });

  describe("no cliff, no tge", () => {
    it('vesting without cliff', async function() {
      const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[
        WEEK * 4 * 12, // period
        0, // no cliff
        0, // no tge
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

    expect((await vesting.toClaim(owner.address)).amount).is.eq(0);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(0);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(0);

    // ----------------------- pass 4 of 12 months of the vesting period
    await TimeUtils.advanceBlocksOnTs(WEEK * 4);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(83);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(83);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(666);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(83);
    expect(await token.balanceOf(owner3.address)).is.eq(666);

    // ----------------------- pass 10 of 12 months of the vesting period
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 9);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(750);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(833);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(6000);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(833);
    expect(await token.balanceOf(owner3.address)).is.eq(6666);

    // ----------------------- pass full vesting period + 4 additional months
    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner.address)).amount).is.eq(167);
    expect((await vesting.toClaim(owner2.address)).amount).is.eq(1000);
    expect((await vesting.toClaim(owner3.address)).amount).is.eq(1334);

    await vesting.connect(owner).claim();
    await vesting.connect(owner3).claim();

    expect(await token.balanceOf(owner.address)).is.eq(1000);
    expect(await token.balanceOf(owner3.address)).is.eq(8000);


    await TimeUtils.advanceBlocksOnTs(WEEK * 4 * 6);

    expect((await vesting.toClaim(owner2.address)).amount).is.eq(1000);

    await vesting.connect(owner2).claim();

    expect(await token.balanceOf(owner2.address)).is.eq(1000);
    expect(await token.balanceOf(await vesting.getAddress())).is.eq(0);
  });

    it("toClaim should return correct amount (no claims)", async () => {
      const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[WEEK * 4 * 12, 0, 0]) as Vesting;

      const amount = 3000;
      await token.mint(vesting, amount);

      const claimants = [owner.address, owner2.address];
      const amounts = [1000, 2000];

      const claim0 = await vesting.toClaim(owner.address);
      expect(claim0.amount).eq(0n);
      expect(claim0._lastVestedClaimTs).eq(0n);
      expect(claim0.extraAmount).eq(0n);

      await vesting.start(true, token, amount, claimants, amounts);

      const claim1 = await vesting.toClaim(owner.address);
      expect(claim1.amount).eq(0n);
      expect(claim1._lastVestedClaimTs).eq(await vesting.vestingStartTs());
      expect(claim1.extraAmount).eq(0n);

      await TimeUtils.advanceBlocksOnTs(WEEK * 2 * 12);

      const claim2 = await vesting.toClaim(owner.address);
      expect(claim2.amount).eq(500n);
      expect(claim2._lastVestedClaimTs).eq(await vesting.vestingStartTs());
      expect(claim2.extraAmount).eq(0n);

      await TimeUtils.advanceBlocksOnTs(WEEK * 2 * 12);

      const claim3 = await vesting.toClaim(owner.address);
      expect(claim3.amount).eq(1000n);
      expect(claim3._lastVestedClaimTs).eq(await vesting.vestingStartTs());
      expect(claim3.extraAmount).eq(0n);

      // ------------------ reduce balance of the vesting contract for test purposes
      await token.connect(await DeployUtils.impersonate(await vesting.getAddress())).transfer(owner3.address, 3000 - 11);
      const claim4 = await vesting.toClaim(owner.address);
      expect(claim4.amount).eq(11n);
      expect(claim4._lastVestedClaimTs).eq(await vesting.vestingStartTs());
      expect(claim4.extraAmount).eq(0n);
    });

    it("toClaim should return correct amount (multiple claims)", async () => {
      const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[WEEK * 4 * 12, 0, 0]) as Vesting;

      const amount = 3000;
      await token.mint(vesting, amount);

      const claimants = [owner.address, owner2.address];
      const amounts = [1000, 2000];

      await vesting.start(true, token, amount, claimants, amounts);

      await TimeUtils.advanceBlocksOnTs(WEEK * 2 * 12);

      const claim1 = await vesting.toClaim(owner.address);
      expect(claim1.amount).eq(500n);
      expect(claim1._lastVestedClaimTs).eq(await vesting.vestingStartTs());
      expect(claim1.extraAmount).eq(0n);

      await vesting.connect(owner).claim();

      const claim2 = await vesting.toClaim(owner.address);
      expect(claim2.amount).eq(0);
      expect(claim2._lastVestedClaimTs).gt(await vesting.vestingStartTs());
      expect(claim2.extraAmount).eq(0n);

      await TimeUtils.advanceBlocksOnTs(WEEK * 12);

      const claim3 = await vesting.toClaim(owner.address);
      expect(claim3.amount).eq(250n);
      const b3 = await vesting.unpackLastVestedData(await vesting.lastVestedClaim(owner.address));

      expect(claim3._lastVestedClaimTs).eq(b3.lastVestedClaimTs);
      expect(claim3.extraAmount).eq(0n);

      await vesting.connect(owner).claim();

      await TimeUtils.advanceBlocksOnTs(WEEK * 12 + 10);

      const claim4 = await vesting.toClaim(owner.address);
      expect(claim4.amount).eq(250n);
      const b4 = await vesting.unpackLastVestedData(await vesting.lastVestedClaim(owner.address));
      expect(claim4._lastVestedClaimTs).eq(b4.lastVestedClaimTs);
      expect(claim4.extraAmount).eq(0n);

      await vesting.connect(owner).claim();

      const claim5 = await vesting.toClaim(owner.address);
      expect(claim5.amount).eq(0n);
      const b5 = await vesting.unpackLastVestedData(await vesting.lastVestedClaim(owner.address));
      expect(claim5._lastVestedClaimTs).eq(b5.lastVestedClaimTs);
      expect(claim5.extraAmount).eq(0n);

      expect(await token.balanceOf(owner)).eq(1000n);
    });

    it("toClaim should return correct amount (a lot of small claims)", async () => {
      const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[WEEK * 4 * 12, 0, 0]) as Vesting;

      const amount = parseUnits("33333");
      const amount1 = parseUnits("13333");
      await token.mint(vesting, amount);

      const claimants = [owner.address, owner2.address];
      const amounts = [amount1, amount - amount1];

      await vesting.start(true, token, amount, claimants, amounts);

      const COUNT = 4;
      for (let i = 0; i < COUNT; ++i) {
        await TimeUtils.advanceBlocksOnTs(Math.floor(WEEK * 4 * 12 / COUNT));
        await vesting.connect(owner).claim();
      }

      await TimeUtils.advanceBlocksOnTs(WEEK);
      if ((await vesting.toClaim(owner)).amount) {
        await vesting.connect(owner).claim();
      } else {
        console.log("no more tokens to claim")
      }

      expect(await token.balanceOf(owner)).eq(amount1);
    });
  });

  it("should revert if pass wrong params to constructor", async () => {
    await expect(DeployerUtils.deployContract(owner, 'Vesting', ...[
      0, // (!) _vestingPeriod
      WEEK * 4 * 3, // _cliffPeriod
      10, // _tgePercent
    ])).rejectedWith("Zero vesting");

    await expect(DeployerUtils.deployContract(owner, 'Vesting', ...[
      WEEK * 4 * 12,
      WEEK * 4 * 3,
      100, // (!) _tgePercent
    ])).rejectedWith("Too much TGE");
  });

  it("should take amount from signer's balance if useTokensOnBalance is false", async () => {
    const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[
      WEEK * 4 * 12,
      WEEK * 4 * 3,
      10,
    ]) as Vesting;

    const amount = 3000;
    await token.mint(owner, amount);

    await token.connect(owner).approve(vesting, amount);
    await vesting.start(false, await token.getAddress(), amount, [owner.address, owner2.address], [1000, 2000]);

    expect(await token.balanceOf(owner)).eq(0);
    expect(await token.balanceOf(vesting)).eq(amount);
  });

  it("should revert if start is called with wrong params", async () => {
    const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[
      WEEK * 4 * 12,
      WEEK * 4 * 3,
      10,
    ]) as Vesting;

    const amount = 3000;
    await token.mint(vesting, amount);

    const claimants = [owner.address, owner2.address];
    const amounts = [1000, 2000];

    await expect(vesting.start(true, ethers.ZeroAddress, amount, claimants, amounts)).rejectedWith("Zero address");
    await expect(vesting.start(true, token, amount, [...claimants, owner3.address], amounts)).rejectedWith("Wrong input");
    await expect(vesting.start(true, token, amount, [owner.address, ethers.ZeroAddress], amounts)).rejectedWith("Zero address");
    await expect(vesting.start(true, token, amount, claimants, [0, 1])).rejectedWith("Zero amount");
    await expect(vesting.start(true, token, amount, claimants, [1000, 2001])).rejectedWith("Wrong total amount");
    await expect(vesting.start(true, token, amount, claimants, [1000, 1999])).rejectedWith("Wrong total amount");
    await expect(vesting.start(true, token, amount + 1, claimants, [1000, 2001])).rejectedWith("Not enough tokens");

    await vesting.start(true, token, amount, claimants, amounts);
    await expect(vesting.start(true, token, amount, claimants, amounts)).rejectedWith("Already started");
  });

  it("claim should revert on bad paths", async () => {
    const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[WEEK * 4 * 12, 0, 0]) as Vesting;

    const amount = parseUnits("30000");
    await token.mint(vesting, amount);

    const claimants = [owner.address, owner2.address];
    const amounts = [parseUnits("10000"), parseUnits("20000")];

    await expect(vesting.connect(owner3).claim()).rejectedWith("Not started");

    await vesting.start(true, token, amount, claimants, amounts);
    await TimeUtils.advanceBlocksOnTs(WEEK);

    await expect(vesting.connect(owner3).claim()).rejectedWith("Nothing to claim");
  });

  describe("vesting multiple users, multiple claims, with decimals", () => {
    [
      {cliff: 0, tge: 0},
      {cliff: 0, tge: 11},
      {cliff: 50, tge: 41},
      {cliff: 50, tge: 93},
    ].forEach(({cliff, tge}) => {
      it(`cliff=${cliff} tge=${tge}`, async function () {
        const PERIOD = 1277;
        const vesting = await DeployerUtils.deployContract(owner, 'Vesting', ...[
          PERIOD * DAY, // period
          cliff * DAY, // no cliff
          tge, // no tge
        ]) as Vesting;

        const amount = parseUnits("20000000");
        await token.mint(await vesting.getAddress(), amount);

        const claimants = [owner, owner2, owner3, user4, user5, user6, user7];
        const amounts = [380085, 70, 3456789, 2987654, 4321098, 3210987, 5643317].map(x => parseUnits(x.toString()));
        const claimPeriod = [1, 2, 3, 5, 7, 9, 0];

        await vesting.start(true, await token.getAddress(), amount, claimants, amounts);

        if (cliff !== 0) {
          await TimeUtils.advanceBlocksOnTs(Math.ceil(DAY * cliff));
        }

        let days = 0;
        while (days < PERIOD + 250) {
          let delta = (1 + Math.log(1 + days) * Math.PI);
          await TimeUtils.advanceBlocksOnTs(Math.ceil(DAY * delta));

          for (let i = 0; i < claimants.length; i++) {
            const period = claimPeriod[i];
            if (period === 0) continue;

            if ((Math.floor(days) % period) === 0) {
              const toClaim = await vesting.toClaim(claimants[i]);
              if (toClaim.amount) {
                await vesting.connect(claimants[i]).claim();
                // console.log(`days=${days.toFixed(0)}: ${i} claims ${+formatUnits(toClaim.amount)}`);
              }
            }
          }

          days += delta;
        }

        for (let i = 0; i < claimants.length; i++) {
          const toClaim = await vesting.toClaim(claimants[i]);
          if (toClaim.amount) {
            await vesting.connect(claimants[i]).claim();
            // console.log(`final: ${i} claims ${+formatUnits(toClaim.amount)}`);
          }
        }

        for (let i = 0; i < claimants.length; i++) {
          expect(await token.balanceOf(claimants[i])).is.eq(amounts[i]);
        }

        expect(await token.balanceOf(vesting)).eq(0);
      });
    });
  });
});
