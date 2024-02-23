import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDeployedContractByName, txParams } from '../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';
import { parseUnits } from 'ethers';
import { TokenFactory__factory } from '../typechain';

const NAME = 'VeNFT';


const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  ////////////////////////////////////////////////


  const UNDERLYING_BPT = await TokenFactory__factory.connect(await getDeployedContractByName('TokenFactory'), ethers.provider).token(); // todo change to BPT

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
