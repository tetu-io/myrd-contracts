import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { txParams } from '../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';

const NAME = 'VestingSeed';
const DAY = 60 * 60 * 24;
const VESTING_PERIOD = DAY * 30 * 8;
const CLIFF_PERIOD = DAY * 90;
const TGE_PERCENT = 5;

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy(NAME, {
    contract: 'Vesting',
    from: deployer,
    args: [VESTING_PERIOD, CLIFF_PERIOD, TGE_PERCENT],
    log: true,
    skipIfAlreadyDeployed: true,
    ...(await txParams(hre, ethers.provider)),
  });
};
export default func;
func.tags = [NAME];
