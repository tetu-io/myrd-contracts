import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { txParams } from '../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';
import { SALE_END, SALE_PRICE, SALE_START } from '../deploy_helpers/sale.config';
import { ERC20__factory } from '../typechain';
import { parseUnits } from 'ethers';

const NAME = 'Sale';

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, GOVERNANCE, PAY_TOKEN } = await getNamedAccounts();

  console.log('Deploy Sale contract');
  console.log('GOVERNANCE', GOVERNANCE);
  console.log('PAY_TOKEN', PAY_TOKEN);
  console.log('SALE_PRICE', SALE_PRICE);
  console.log('SALE_START', SALE_START);
  console.log('SALE_END', SALE_END);

  let payTokenDecimals = 18;

  if(hre.network.name !== 'hardhat') {
    payTokenDecimals = +(await ERC20__factory.connect(PAY_TOKEN, (await ethers.getSigner(deployer)))
      .decimals()).toString();
  }
  console.log('payTokenDecimals', payTokenDecimals);

  const salePrice = parseUnits(SALE_PRICE.toFixed(payTokenDecimals), payTokenDecimals);
  console.log('salePrice', salePrice.toString());

  await deploy(NAME, {
    contract: 'Sale',
    from: deployer,
    args: [
      GOVERNANCE,
      PAY_TOKEN,
      salePrice,
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
