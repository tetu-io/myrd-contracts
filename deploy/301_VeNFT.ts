import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDeployedContractByName, txParams } from '../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';
import { parseUnits, ZeroAddress } from 'ethers';
import { LiquidityFactory__factory } from '../typechain';
import {BalancerUtils} from "../scripts/utils/balancer-utils";

const NAME = 'VeNFT';

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  ////////////////////////////////////////////////


  const UNDERLYING_BPT = await LiquidityFactory__factory.connect(await getDeployedContractByName('LiquidityFactory'), ethers.provider).deployedBPT(deployer);
  if (UNDERLYING_BPT == ZeroAddress) {
    throw new Error("Underlying not deployed yet")
  } else {
    const signer = (await ethers.getSigners())[0];
    const isPoolInited = await BalancerUtils.isPoolInited(UNDERLYING_BPT, signer)
    if (!isPoolInited) {
      throw new Error("BPT is not initialized")
    }
  }

  const VE_NAME = 'Voting escrow MYRD';
  const VE_SYMBOL = 'veMYRD';
  const VE_TOKENS = [UNDERLYING_BPT];
  const VE_WEIGHTS = [parseUnits('100')];

  ////////////////////////////////////////////////


  await deploy(NAME, {
    contract: 'VeNFT',
    from: deployer,
    args: [
      VE_NAME,
      VE_SYMBOL,
      VE_TOKENS,
      VE_WEIGHTS,
    ],
    log: true,
    skipIfAlreadyDeployed: true,
    ...(await txParams(hre, ethers.provider)),
  });
};
export default func;
func.tags = [NAME];
func.dependencies = [
  'LiquidityFactory',
];
