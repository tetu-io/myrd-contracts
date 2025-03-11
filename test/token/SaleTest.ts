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

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let governance: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let payToken: MockToken;
  let tokenToSale: MockToken;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, governance, user1, user2] = await ethers.getSigners();

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

  describe("Normal case", () => {
    let snapshot1: string;
    let sale: Sale;

    before(async function () {
      snapshot1 = await TimeUtils.snapshot();
      sale = await DeployerUtils.deployContract(owner, 'Sale', ...[
        governance,
        payToken,
        PRICE,
        Math.floor(new Date().getTime() / 1000 + 60 * 60), // now + 1 hour
        Math.floor(new Date().getTime() / 1000 + 60 * 60 + DURATION_SECONDS),
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
      const TO_BUY_AMOUNT_2 = parseUnits("900");

      const stateBefore = await getState();

      const price = await sale.price();
      const PAY_AMOUNT_10 = TO_BUY_AMOUNT_10 * price / parseUnits("1");
      const PAY_AMOUNT_11 = TO_BUY_AMOUNT_11 * price / parseUnits("1");
      const PAY_AMOUNT_2 = TO_BUY_AMOUNT_2 * price / parseUnits("1");

      await TimeUtils.advanceBlocksOnTs(2 * 60 * 60); // 2 hours => start

      //--------------------- users 1 and 2 buy token for sale
      await sale.connect(user1).buy(TO_BUY_AMOUNT_10);
      await sale.connect(user2).buy(TO_BUY_AMOUNT_2);
      await sale.connect(user1).buy(TO_BUY_AMOUNT_11);

      //--------------------- end up the sale
      await TimeUtils.advanceBlocksOnTs(7 * 24 * 60 * 60);

      //--------------------- claim the token
      await sale.connect(governance).allowClaim();

      await sale.connect(user1).burnNotSold();

      await sale.connect(user1).claim();
      await sale.connect(user2).claim();

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

      //--------------------- burn remaining tokens
      await sale.connect(user1).burnNotSold();

      const stateAfterBurn = await getState();
      expect(stateAfterBurn.sale.saleTokenBalance).eq(0);
    });
  });
});