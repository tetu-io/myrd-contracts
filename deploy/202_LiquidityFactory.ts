import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import {getDeployedContractByName, txParams} from "../deploy_helpers/deploy-helpers";
import { ethers } from 'hardhat';
import { TokenFactory__factory, LiquidityFactory, LiquidityFactory__factory, IWeightedPoolFactory__factory, ERC20__factory, MockWeth9__factory, IBVault__factory, IBPT__factory } from '../typechain';
import { AbiCoder, ZeroAddress, parseUnits, EventLog } from 'ethers'
import {BalancerUtils} from "../scripts/utils/balancer-utils";
import {DeployerUtils} from "../scripts/deploy/DeployerUtils";

const NAME = 'LiquidityFactory';


const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, WETH, BALANCER_WEIGHTED_POOL_FACTORY, BALANCER_VAULT } = await getNamedAccounts();
  const signer = (await ethers.getSigners())[0];

  let liquidityFactoryAddress = await getDeployedContractByName('LiquidityFactory')
  let bptAddress: string|undefined
  let lpFactory: LiquidityFactory|undefined
  let wethAddress: string = ''
  let balancerVault: string = ''
  if (!liquidityFactoryAddress) {
    let args = []
    if (hre.network.config.chainId == 31337) {
      const balancerCore = await DeployerUtils.deployBalancer(signer);

      const weightedPoolFactory = await DeployerUtils.deployContract(signer, 'WeightedPoolFactory', ...[
        await balancerCore.vault.getAddress(),
        await balancerCore.protocolFeePercentagesProvider.getAddress(),
        BalancerUtils.PAUSE_WINDOW_DURATION,
        BalancerUtils.BUFFER_PERIOD_DURATION
      ])

      const weth = await DeployerUtils.deployContract(signer, 'MockWeth9')
      args = [await weightedPoolFactory.getAddress(), await weth.getAddress()]
      wethAddress = await weth.getAddress()
      balancerVault = await balancerCore.vault.getAddress()
    } else {
      wethAddress = WETH
      args = [BALANCER_WEIGHTED_POOL_FACTORY, WETH]
      balancerVault = BALANCER_VAULT
    }

    const result = await deploy(NAME, {
      contract: 'LiquidityFactory',
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      ...(await txParams(hre, ethers.provider)),
      args,
    });
    liquidityFactoryAddress = result.address
    lpFactory = LiquidityFactory__factory.connect(liquidityFactoryAddress, signer)
    bptAddress = ZeroAddress
  } else {
    lpFactory = LiquidityFactory__factory.connect(liquidityFactoryAddress, signer)
    bptAddress = await lpFactory.deployedBPT(deployer)
  }

  const tokenFactoryAddress = await getDeployedContractByName('TokenFactory')
  const tokenFactory = TokenFactory__factory.connect(tokenFactoryAddress, ethers.provider)
  const token = await tokenFactory.token()


  if (bptAddress == ZeroAddress) {
    await lpFactory.deployBPT(token)
    bptAddress = await lpFactory.deployedBPT(deployer)
  }

  const isPoolInited = await BalancerUtils.isPoolInited(bptAddress, signer)

  if (isPoolInited) {
    console.log('Pool already inited')
  } else {
    let assets = [token,wethAddress as string]
    // start price = $1 ~= 0.0003, initial weth amount = 0.01 (1e16)
    let initialBalances = [parseUnits('0.01') * 3333n * 4n,parseUnits('0.01')]
    if (BigInt(assets[0]) > BigInt(assets[1])) {
      assets = [assets[1], assets[0]]
      initialBalances = [initialBalances[1], initialBalances[0]]
    }
    const weth9 = MockWeth9__factory.connect(wethAddress as string, signer)
    await weth9.deposit({value: parseUnits('0.01')})
    await ERC20__factory.connect(token, signer).approve(balancerVault, parseUnits('200'))
    await weth9.approve(balancerVault, parseUnits('0.01'))

    const vault = IBVault__factory.connect(balancerVault, signer)
    const poolId = await IBPT__factory.connect(bptAddress as string, signer).getPoolId()
    const tx = await vault.joinPool(
      poolId,
      deployer,
      deployer,
      {
        assets,
        maxAmountsIn: initialBalances,
        userData: AbiCoder.defaultAbiCoder().encode(
          ["uint256", "uint256[]"],
          [0, initialBalances],
        ),
        fromInternalBalance: false,
      }
    )
    await tx.wait()
  }

  /* Deploying pool manually
  let assets = [token,WETH]
  let weights = [parseUnits('0.8'),parseUnits('0.2')]
  let initialBalances = [parseUnits('0.01') * 3333n * 4n,parseUnits('0.01')]

  if (BigInt(assets[0]) > BigInt(assets[1])) {
    assets = [assets[1], assets[0]]
    weights = [weights[1], weights[0]]
    initialBalances = [initialBalances[1], initialBalances[0]]
  }
  const wpf = IWeightedPoolFactory__factory.connect(BALANCER_WEIGHTED_POOL_FACTORY, signer)
  const txResponse = await wpf.create(
    "Balancer Weighted Pool",
    "B-WEIGHTED",
    assets,
    weights,
    [ZeroAddress, ZeroAddress],
    parseUnits('0.025'),
    signer.address,
    ethers.keccak256("0x00")
  )
  let bptAddr:string|undefined
  const txReceipt = await txResponse.wait()
  if (!txReceipt) {
    throw Error()
  }
  for (const log of txReceipt.logs) {
    if (log instanceof EventLog && log.fragment?.name === 'PoolCreated' ) {
      bptAddr = log.args[0]
      console.log('bptAddr', bptAddr)
    }
  }
  */
};
export default func;
func.tags = [NAME];
func.dependencies = [
  'TokenFactory',
];
