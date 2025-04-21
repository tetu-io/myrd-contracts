import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { deployOneInstanceProxy, getDeployedContractByName } from '../deploy_helpers/deploy-helpers';
import {Controller__factory, MultiGauge__factory, TokenFactory__factory, XMyrd__factory} from '../typechain';
import { Misc, getNetworkName } from '../scripts/Misc';
import {CoreAddresses} from "../scripts/addresses/CoreAddresses";
import {mkdirSync, writeFileSync} from "node:fs";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('start deploy AllCoreProxies');

  const {deployments, getNamedAccounts} = hre;
  const {deployer} = await getNamedAccounts();

  const signer = await ethers.getSigner(deployer);

  // ------------------ get token factory and (already deployed) MYRD
  const tokenFactory = await getDeployedContractByName('TokenFactory');
  const myrd = await TokenFactory__factory.connect(tokenFactory, signer).token();
  // const governance = await TokenFactory__factory.connect(tokenFactory, signer).governance();
  // if (governance === ethers.ZeroAddress) throw new Error('TokenFactory not initialized');

  // ------------------ deploy and initialize controller
  const controller = await deployOneInstanceProxy(hre, deployments, deployer, 'Controller');
  const c = Controller__factory.connect(controller.address, signer);
  if ((await Controller__factory.connect(controller.address, signer).controller()) === ethers.ZeroAddress) {
    await Misc.runAndWait2(Controller__factory.connect(controller.address, signer).init.populateTransaction(
      // governance // use governance from TokenFactory
      deployer
    ));
  }

  // ------------------ deploy proxies for xmyrd and gauge
  const xmyrd = (await deployOneInstanceProxy(hre, deployments, deployer, 'XMyrd')).address;
  const gauge = (await deployOneInstanceProxy(hre, deployments, deployer, 'MultiGauge')).address;

  // ------------------ initialize xmyrd and gauge
  if (await XMyrd__factory.connect(xmyrd, signer).controller() === ethers.ZeroAddress) {
    await Misc.runAndWait2(XMyrd__factory.connect(xmyrd, signer).initialize.populateTransaction(controller.address, myrd, gauge));
  }

  if (await MultiGauge__factory.connect(gauge, signer).controller() === ethers.ZeroAddress) {
    await Misc.runAndWait2(MultiGauge__factory.connect(gauge, signer).init.populateTransaction(controller.address, xmyrd, myrd));
  }

  // ------------------ create core
  const core = new CoreAddresses(
    tokenFactory,
    controller.address,
    gauge,
    xmyrd,
  );

  // ------------------ print result
  console.log(core);
  mkdirSync('./tmp/deployed', {recursive: true});
  writeFileSync(`./tmp/deployed/${getNetworkName()}_core.json`, '\n' + JSON.stringify(core) + '\n', 'utf8');
};

export default func;
func.tags = ['AllCoreProxies'];
func.dependencies = [
  'TokenFactory',
  'Controller',
  'XMyrd',
  'MultiGauge',
];
