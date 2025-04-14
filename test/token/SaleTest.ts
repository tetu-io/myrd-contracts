import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";
import {MockToken, Sale, Vesting} from "../../typechain";
import {TimeUtils} from "../utils/TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {parseUnits} from "ethers";
import {expect} from "chai";

describe('SaleTest', function() {
  const PRICE = parseUnits("7");
  const DURATION_SECONDS = 60 * 60 * 24 * 7; // 1 week
  const SALE_TOTAL_AMOUNT = parseUnits("4000000");
  const INIT_PAY_AMOUNT = parseUnits("1000000000000000000");
  const START_DELAY = 60 * 60; // 1 hour

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  let payToken: MockToken;
  let tokenToSale: MockToken;

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

  async function getNowInSeconds() : Promise<number> {
    return (await ethers.provider.getBlock("latest"))?.timestamp ?? 0;
  }

  describe("Normal case", () => {
    let snapshot1: string;
    let sale: Sale;

    before(async function () {
      snapshot1 = await TimeUtils.snapshot();
      sale = await DeployerUtils.deployContract(owner, 'Sale', ...[
        governance,
        payToken,
        PRICE,
        (await getNowInSeconds() + START_DELAY), // now + 1 hour
        (await getNowInSeconds() + START_DELAY + DURATION_SECONDS),
      ]) as Sale;

      await tokenToSale.mint(sale, SALE_TOTAL_AMOUNT);
      await sale.setupTokenToSale(tokenToSale);

      await payToken.connect(user1).approve(sale, INIT_PAY_AMOUNT);
      await payToken.connect(user2).approve(sale, INIT_PAY_AMOUNT);
    });

    after(async function () {
      await TimeUtils.rollback(snapshot1);
    });

    //region Utils
    interface IUserState {
      payTokenBalance: bigint;
      saleTokenBalance: bigint;
    }

    interface IState {
      user1: IUserState;
      user2: IUserState;
      sale: IUserState;
      governance: IUserState;
    }

    async function getUserState(user: string): Promise<IUserState> {
      return {
        payTokenBalance: BigInt(await payToken.balanceOf(user)),
        saleTokenBalance: BigInt(await tokenToSale.balanceOf(user)),
      }
    }

    async function getState(): Promise<IState> {
      return {
        user1: await getUserState(user1.address),
        user2: await getUserState(user2.address),
        sale: await getUserState(await sale.getAddress()),
        governance: await getUserState(governance.address),
      }
    }
    //endregion Utils

    it("users 1 and 2 buy token for sale and claim it", async () => {
      const TO_BUY_AMOUNT_10 = parseUnits("400");
      const TO_BUY_AMOUNT_11 = parseUnits("1200");
      const TO_BUY_AMOUNT_2 = SALE_TOTAL_AMOUNT / 10n;

      const stateBefore = await getState();

      const price = await sale.price();
      const PAY_AMOUNT_10 = TO_BUY_AMOUNT_10 * price / parseUnits("1");
      const PAY_AMOUNT_11 = TO_BUY_AMOUNT_11 * price / parseUnits("1");
      const PAY_AMOUNT_2 = TO_BUY_AMOUNT_2 * price / parseUnits("1");


      await expect(sale.connect(user1).buy(TO_BUY_AMOUNT_10)).rejectedWith("Sale is not started yet");

      await TimeUtils.advanceBlocksOnTs(START_DELAY + 1); // > 1 hour => start

      //--------------------- users 1 and 2 buy token for sale
      await sale.connect(user1).buy(TO_BUY_AMOUNT_10);
      await sale.connect(user2).buy(TO_BUY_AMOUNT_2);
      await sale.connect(user1).buy(TO_BUY_AMOUNT_11);
      await expect(sale.connect(user1).buy(0)).rejectedWith("Zero amount");
      await expect(sale.connect(user1).buy(SALE_TOTAL_AMOUNT)).rejectedWith("Too much");
      await expect(sale.connect(user1).buy(SALE_TOTAL_AMOUNT / 10n)).rejectedWith("Too much for user");

      //--------------------- end up the sale
      await expect(sale.connect(user1).claim()).rejectedWith("sale not ended");

      await TimeUtils.advanceBlocksOnTs(7 * 24 * 60 * 60);
      await expect(sale.connect(user1).buy(TO_BUY_AMOUNT_10)).rejectedWith("Sale ended");

      //--------------------- claim the token
      await expect(sale.connect(user1).claim()).rejectedWith("not allowed yet");
      await sale.connect(governance).allowClaim();

      await sale.connect(user1).claim();
      await sale.connect(user2).claim();
      await expect(sale.connect(user3).claim()).rejectedWith("bought zero");

      //--------------------- check state
      const stateAfter = await getState();

      expect(stateBefore.user1.payTokenBalance - stateAfter.user1.payTokenBalance).eq(PAY_AMOUNT_10 + PAY_AMOUNT_11);
      expect(stateAfter.user1.saleTokenBalance - stateBefore.user1.saleTokenBalance).eq(TO_BUY_AMOUNT_10 + TO_BUY_AMOUNT_11);

      expect(stateBefore.user2.payTokenBalance - stateAfter.user2.payTokenBalance).eq(PAY_AMOUNT_2);
      expect(stateAfter.user2.saleTokenBalance - stateBefore.user2.saleTokenBalance).eq(TO_BUY_AMOUNT_2);

      expect(stateAfter.governance.payTokenBalance - stateBefore.governance.payTokenBalance).eq(
        PAY_AMOUNT_10 + PAY_AMOUNT_11 + PAY_AMOUNT_2
      );
      expect(stateBefore.governance.saleTokenBalance).eq(0n);
      expect(stateAfter.governance.saleTokenBalance).eq(0n);

      expect(stateBefore.sale.payTokenBalance).eq(0n);
      expect(stateAfter.sale.payTokenBalance).eq(0n);

      expect(stateBefore.sale.saleTokenBalance).eq(SALE_TOTAL_AMOUNT);
      expect(stateAfter.sale.saleTokenBalance).eq(
        SALE_TOTAL_AMOUNT
        - TO_BUY_AMOUNT_10 - TO_BUY_AMOUNT_11
        - TO_BUY_AMOUNT_2
      );

    });

    it("should allow to burn tokens in 1 month since end of sale", async () => {
      const TO_BUY_AMOUNT_10 = parseUnits("400");
      const TO_BUY_AMOUNT_20 = parseUnits("500");

      const price = await sale.price();
      const PAY_AMOUNT_10 = TO_BUY_AMOUNT_10 * price / parseUnits("1");
      const PAY_AMOUNT_20 = TO_BUY_AMOUNT_20 * price / parseUnits("1");

      await TimeUtils.advanceBlocksOnTs(START_DELAY + 1); // > 1 hour => start

      await expect(sale.connect(governance).burnNotSold()).rejectedWith("not ended");

      //--------------------- users 1 and 2 buy token for sale
      await sale.connect(user1).buy(TO_BUY_AMOUNT_10);
      await sale.connect(user2).buy(TO_BUY_AMOUNT_10);

      //--------------------- end up the sale
      await TimeUtils.advanceBlocksOnTs(7 * 24 * 60 * 60);

      //--------------------- claim the token
      await sale.connect(governance).allowClaim();

      await expect(sale.connect(governance).burnNotSold()).rejectedWith("< 1 month since end");

      await sale.connect(user2).claim();

      //--------------------- 1 month is passed
      await TimeUtils.advanceBlocksOnTs(30 * 24 * 60 * 60);

      //--------------------- burn remaining tokens
      await expect(sale.connect(user1).burnNotSold()).rejectedWith("not allowed");
      await sale.connect(governance).burnNotSold();
      await expect(sale.connect(governance).burnNotSold()).rejectedWith("nothing to burn");

      const stateAfterBurn = await getState();
      expect(stateAfterBurn.sale.saleTokenBalance).eq(0);

      // user 1 is not able to claim his tokens after burning
      await expect(sale.connect(user1).claim()).rejected;
    });

    it("should allow governance to call allowClaim() at any moment", async () => {
      const TO_BUY_AMOUNT_10 = parseUnits("400");
      const stateBefore = await getState();

      //--------------------- allow to claim at any moment
      await expect(sale.connect(user1).allowClaim()).rejectedWith("not allowed");

      expect(await sale.allowToClaim()).eq(false);
      await sale.connect(governance).allowClaim();
      await sale.connect(governance).allowClaim();
      expect(await sale.allowToClaim()).eq(true);

      //--------------------- start sale
      await TimeUtils.advanceBlocksOnTs(START_DELAY + 1);

      //--------------------- users 1 and 2 buy token for sale
      await sale.connect(user1).buy(TO_BUY_AMOUNT_10);

      //--------------------- end up the sale, claim
      await expect(sale.connect(user1).claim()).rejectedWith("not ended");
      await TimeUtils.advanceBlocksOnTs(7 * 24 * 60 * 60);
      await sale.connect(user1).claim();

      //--------------------- check state
      const stateAfter = await getState();

      expect(stateAfter.user1.saleTokenBalance - stateBefore.user1.saleTokenBalance).eq(TO_BUY_AMOUNT_10);
    });
  });

  describe("setupTokenToSale", () => {
    it("should revert if data is incorrect", async () => {
      const sale = await DeployerUtils.deployContract(owner, 'Sale', ...[
        governance,
        payToken,
        PRICE,
        (await getNowInSeconds() + START_DELAY), // now + 1 hour
        (await getNowInSeconds() + START_DELAY + DURATION_SECONDS),
      ]) as Sale;

      expect((await sale.tokenToSale()).toLowerCase()).eq(ethers.ZeroAddress);

      await expect(sale.setupTokenToSale(ethers.ZeroAddress)).rejectedWith("zero token");
      await expect(sale.setupTokenToSale(tokenToSale)).rejectedWith("incorrect supply");

      await tokenToSale.mint(sale, SALE_TOTAL_AMOUNT);
      await sale.setupTokenToSale(tokenToSale);

      expect((await sale.tokenToSale()).toLowerCase()).eq((await tokenToSale.getAddress()).toLowerCase());

      await expect(sale.setupTokenToSale(tokenToSale)).rejectedWith("already");
    });
  })

  describe("constructor", () => {
    it("should revert if data is incorrect", async () => {
      const start = (await getNowInSeconds() + START_DELAY); // now + 1 hour
      const end = (await getNowInSeconds() + START_DELAY + 24*60*60 + 1);
      await expect(DeployerUtils.deployContract(owner, 'Sale', ...[ethers.ZeroAddress, payToken, PRICE, start, end])).rejectedWith("zero gov");
      await expect(DeployerUtils.deployContract(owner, 'Sale', ...[governance, ethers.ZeroAddress, PRICE, start, end])).rejectedWith("zero pay");
      await expect(DeployerUtils.deployContract(owner, 'Sale', ...[governance, payToken, 0n, start, end])).rejectedWith("zero price");
      await expect(DeployerUtils.deployContract(owner, 'Sale', ...[governance, payToken, PRICE, Math.floor(await getNowInSeconds() - 1), end])).rejectedWith("incorrect start");
      await expect(DeployerUtils.deployContract(owner, 'Sale', ...[governance, payToken, PRICE, start, start + 24*60*60])).rejectedWith("incorrect end", "< 1 day");
      const sale = await DeployerUtils.deployContract(owner, 'Sale', ...[governance, payToken, PRICE, start, end]) as Sale;

      expect((await sale.governance()).toLowerCase()).eq(governance.address.toLowerCase());
      expect((await sale.payToken()).toLowerCase()).eq((await payToken.getAddress()).toLowerCase());
      expect(await sale.price()).eq(PRICE);
      expect(await sale.start()).eq(start);
      expect(await sale.end()).eq(end);
    });
  });
});