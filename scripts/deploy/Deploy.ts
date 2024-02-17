import { Logger } from 'tslog';
import logSettings from '../../log_settings';
import { ContractFactory } from 'ethers';
import { isNetworkName, Misc } from '../Misc';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { deployContract } from './DeployContract';
import { getDeployedContractByName, txParams } from '../../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';
import { Libraries } from 'hardhat-deploy/types';

// tslint:disable-next-line:no-var-requires
const hre = require('hardhat');
const log: Logger<undefined> = new Logger(logSettings);

export class Deploy {

  readonly signer: SignerWithAddress;
  readonly waitBetweenDeploy: number;
  readonly verify: boolean;
  readonly initLogic: boolean;

  public useHardhatDeployForProxy = false;

  constructor(
    signer: SignerWithAddress,
    waitBetweenDeploy = 1,
    verify = false,
    initLogic = false,
  ) {
    this.signer = signer;
    this.waitBetweenDeploy = waitBetweenDeploy;
    // this.verify = verify;
    // no verify until the launch
    this.verify = false;
    this.initLogic = initLogic;
  }

  public async deployContract<T extends ContractFactory>(
    name: string,
    // tslint:disable-next-line:no-any
    ...args: any[]
  ) {
    return deployContract(hre, this.signer, name, ...args);
  }

  /// ONLY FOR PROD DEPLOY!
  public async deployProxyControlled<T extends ContractFactory>(
    logicContractName: string,
  ) {
    const logic = await getDeployedContractByName(logicContractName);
    const proxy = await this.deployContract('ProxyControlled', logic);
    if (!isNetworkName('tetu')) {
      await Misc.wait(this.waitBetweenDeploy);
    }
    return { proxy, logic };
  }

  public async deployProxyForTests(
    logicContractName: string,
    deployedLogic: string | null = null,
  ) {
    let logic;
    if (deployedLogic !== null) {
      console.log('deployProxyControlled logic exist', deployedLogic);
      logic = deployedLogic as string;
    } else {
      console.log('deployProxyControlled logic DO NOT exist', deployedLogic);
      logic = await (await this.deployContract(logicContractName)).getAddress();
    }
    const proxyAddress = await (await this.deployContract('ProxyControlled', logic)).getAddress();
    return proxyAddress;
  }

  public async deployContractHardhatOrLocalAndCheckIsNew(
    logicName: string,
    ctrName: string,
    skipIfAlreadyDeployed: boolean,
    libraries?: Libraries,
  ) {
    console.log('deploy', ctrName);
    const prevDeployed: string = await getDeployedContractByName(ctrName, false);
    let isNewDeploy = true;
    let logic: string;

    if (this.useHardhatDeployForProxy) {
      const { deployments, getNamedAccounts } = hre;
      const { deployer } = await getNamedAccounts();
      logic = (await deployments.deploy(ctrName, {
        contract: logicName,
        from: deployer,
        log: true,
        libraries,
        skipIfAlreadyDeployed,
        ...(await txParams(hre, ethers.provider)),
      })).address;
      isNewDeploy = prevDeployed.toLowerCase() !== logic.toLowerCase();
      console.log('logic', logic);
      console.log('prevDeployed', prevDeployed);
      console.log('isNewDeploy', isNewDeploy);
    } else {
      logic = await (await this.deployContract(logicName)).getAddress();
    }

    return {
      logic,
      isNewDeploy,
      prevDeployed,
    };
  }

}
