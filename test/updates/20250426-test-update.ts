import {
  Controller__factory, MultiGauge,
  MultiGauge__factory, MYRD, MYRD__factory,
  XMyrd,
  XMyrd__factory
} from "../../typechain";
import {ethers} from "hardhat";
import {DeployUtils} from "../utils/DeployUtils";
import {Deploy} from "../../scripts/deploy/Deploy";
import {expect} from "chai";
import {TimeUtils} from "../utils/TimeUtils";
import {Misc} from "../../scripts/Misc";
import {parseUnits} from "ethers";

describe('Test update 20250426', () => {
  interface IState {
    timestamp: number;
    activePeriod: number;
    period: number;
    periodFinish: number;
    pendingRebase: bigint;
    myrdBalance: bigint;
    left: bigint;
  }
  async function getState(gauge: MultiGauge, xmyrd: XMyrd, myrd: MYRD) : Promise<IState> {
    const dest = {
      timestamp: Number((await ethers.provider.getBlock("latest"))?.timestamp ?? 0),
      activePeriod: Number(await gauge.activePeriod()),
      period: Number(await gauge.getPeriod()),
      periodFinish: Number(await gauge.periodFinish(await gauge.xMyrd(), await gauge.defaultRewardToken())),
      pendingRebase: await xmyrd.pendingRebase(),
      myrdBalance: await myrd.balanceOf(gauge),
      left: await gauge.left(xmyrd, myrd)
    }
    console.log("activePeriod", dest.activePeriod);
    console.log("period", dest.period);
    console.log("periodFinish", dest.periodFinish);
    console.log("pendingRebase", dest.pendingRebase);
    console.log("myrdBalance", dest.myrdBalance);
    console.log("left", dest.left);
    return dest;
  }

  it.skip("study, sonic only: should update multi gauge and ensure that updatePeriod works properly", async () => {
    const signer = (await ethers.getSigners())[0];
    const deployer = new Deploy(signer);

    const SONIC_MULTI_GAUGE = "0x9A3Dea4432bE010Db8Bcfd297b918Ad012d389f9";
    const myrdGovernance = await DeployUtils.impersonate("0xBe68f08bCa20e2a413D425c2F1aD7a43E1b67B67");

    const gauge = MultiGauge__factory.connect(SONIC_MULTI_GAUGE, signer);
    const gaugeAsSigner = await DeployUtils.impersonate(SONIC_MULTI_GAUGE);
    const controller = Controller__factory.connect(await gauge.controller(), signer);
    const governance = await DeployUtils.impersonate(await controller.governance());
    const xmyrd = XMyrd__factory.connect(await gauge.xMyrd(), signer);
    const myrd = MYRD__factory.connect(await xmyrd.myrd(), signer);

    if (await gauge.VERSION() !== "1.0.0") return;
    if (await xmyrd.VERSION() !== "1.0.0") return;

    //------------------- Reproduce the problem

    const state0 = await getState(gauge, xmyrd, myrd);

    await expect(gauge.connect(gaugeAsSigner).updatePeriod(0)).revertedWith("Amount should be higher than remaining rewards");

    //------------------- Apply gauge and xmyrd update
    const newGaugeLogic = await (await deployer.deployContract('MultiGauge')).getAddress();
    const newXMyrdLogic = await (await deployer.deployContract('XMyrd')).getAddress();
    await controller.connect(governance).updateProxies([gauge], newGaugeLogic);
    await controller.connect(governance).updateProxies([xmyrd], newXMyrdLogic);
    expect(await gauge.VERSION()).eq("1.0.1");
    expect(await xmyrd.VERSION()).eq("1.0.1");

    //------------------- Now we can update period
    await gauge.connect(gaugeAsSigner).updatePeriod(0);
    // await myrd.connect(gaugeAsSigner).transfer(signer, state0.pendingRebase - state0.left + 1n);

    const state1 = await getState(gauge, xmyrd, myrd);

    expect(state1.timestamp < state1.periodFinish).eq(true);

    expect(state1.myrdBalance).eq(state0.myrdBalance);
    expect(state1.pendingRebase).eq(state0.pendingRebase);
    expect(state1.periodFinish).eq(state0.periodFinish);
    expect(state1.period).eq(state0.period);
    expect(state1.activePeriod).eq(state1.period, "updated");

    //------------------- Skip 1 week
    await TimeUtils.advanceBlocksOnTs(7 * 24 * 60 * 60); // 1 week

    const state2 = await getState(gauge, xmyrd, myrd);
    expect(state2.timestamp >= state2.periodFinish).eq(true);

    //------------------- Update period again
    await gauge.connect(gaugeAsSigner).updatePeriod(0);
    const state3 = await getState(gauge, xmyrd, myrd);

    expect(state3.myrdBalance).approximately(state0.myrdBalance + state0.pendingRebase, 1);
    expect(state3.pendingRebase).eq(0n);
    expect(state3.periodFinish).approximately(state2.timestamp + 7 * 24 * 60 * 60, 1);
    expect(state3.period).eq(state1.period + 1);
    expect(state3.activePeriod).eq(state1.period + 1);

    //------------------- Update period again
    await TimeUtils.advanceBlocksOnTs(7 * 24 * 60 * 60); // 1 week

    await myrd.connect(myrdGovernance).transfer(signer, parseUnits("200"));
    await myrd.connect(signer).approve(xmyrd, Misc.MAX_UINT);
    await xmyrd.connect(signer).enter( parseUnits("200"));
    await xmyrd.connect(signer).exit( parseUnits("200"));

    expect(await xmyrd.pendingRebase()).eq(parseUnits("100"));

    await gauge.connect(gaugeAsSigner).updatePeriod(0);
    const state4 = await getState(gauge, xmyrd, myrd);

    expect(state4.myrdBalance).approximately(state0.myrdBalance + state0.pendingRebase + parseUnits("100"),  1);
    expect(state4.pendingRebase).eq(0);
    expect(state4.periodFinish).approximately(state3.periodFinish + 7 * 24 * 60 * 60, 100);
    expect(state4.period).eq(state3.period + 1);
    expect(state4.activePeriod).eq(state3.period + 1);

  });
});
