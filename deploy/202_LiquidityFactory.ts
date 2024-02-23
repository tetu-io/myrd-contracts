import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const NAME = 'LiquidityFactory';


const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, WETH } = await getNamedAccounts();

  // todo

};
export default func;
func.tags = [NAME];
func.dependencies = [
  'TokenFactory',
];
