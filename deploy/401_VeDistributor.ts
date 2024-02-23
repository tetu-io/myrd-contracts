import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDeployedContractByName, txParams } from '../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';

const NAME = 'VeDistributor';


const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, WETH } = await getNamedAccounts();

  ////////////////////////////////////////////////

  const VE = await getDeployedContractByName('VeNFT');
  const REWARD_TOKEN = WETH;

  ////////////////////////////////////////////////


  await deploy(NAME, {
    contract: 'VeDistributor',
    from: deployer,
    args: [
      VE,
      REWARD_TOKEN,
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
