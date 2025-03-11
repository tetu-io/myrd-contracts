import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { txParams } from '../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';
import { SALE_END, SALE_PRICE, SALE_START } from '../deploy_helpers/sale.config';

const NAME = 'Sale';

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, GOVERNANCE, PAY_TOKEN } = await getNamedAccounts();

  await deploy(NAME, {
    contract: 'Sale',
    from: deployer,
    args: [
      GOVERNANCE,
      PAY_TOKEN,
      SALE_PRICE,
      SALE_START,
      SALE_END,
    ],
    log: true,
    skipIfAlreadyDeployed: true,
    ...(await txParams(hre, ethers.provider)),
  });
};
export default func;
func.tags = [NAME];
