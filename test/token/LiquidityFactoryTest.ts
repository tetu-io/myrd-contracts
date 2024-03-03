import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {MockToken, LiquidityFactory, MockWeth9} from '../../typechain';
import {TimeUtils} from "../TimeUtils";
import { ethers } from 'hardhat';
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {BalancerUtils} from "../../scripts/utils/balancer-utils";

describe('LiquidityFactory', function() {

  let snapshotBefore: string;
  let snapshot: string;
  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let owner4: SignerWithAddress;
  let token: MockToken;
  let weth: MockWeth9;
  let badWeth: MockToken;
  let lf: LiquidityFactory;

  before(async function() {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3, owner4] = await ethers.getSigners();


    badWeth = await DeployerUtils.deployMockToken(owner, 'WETH', 18, true);
    weth = await DeployerUtils.deployContract(owner, 'MockWeth9') as MockWeth9;
    token = await DeployerUtils.deployMockToken(owner, 'TOKEN', 18, true);

    const balancerCore = await DeployerUtils.deployBalancer(owner);

    const weightedPoolFactory = await DeployerUtils.deployContract(owner, 'WeightedPoolFactory', ...[
      await balancerCore.vault.getAddress(),
      await balancerCore.protocolFeePercentagesProvider.getAddress(),
      BalancerUtils.PAUSE_WINDOW_DURATION,
      BalancerUtils.BUFFER_PERIOD_DURATION
    ])

    lf = await DeployerUtils.deployContract(owner, 'LiquidityFactory', ...[
      await weightedPoolFactory.getAddress(),
      await weth.getAddress(),
    ]) as LiquidityFactory;
  })

  it('Deploy BPT', async function() {
    await lf.deployBPT(await token.getAddress())
  })
})