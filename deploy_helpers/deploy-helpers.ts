import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { ethers } from 'hardhat';
import { Libraries } from 'hardhat-deploy/types';
import { formatUnits, Provider } from 'ethers';
import {ProxyControlled__factory} from "../typechain";
import {CoreAddresses} from "../scripts/addresses/CoreAddresses";
import {DeploymentsExtension} from "hardhat-deploy/dist/types";


// tslint:disable-next-line:no-var-requires
const hreLocal = require('hardhat');

const REVERT_IF_NOT_FOUND = false;

export async function isContractExist(hre: HardhatRuntimeEnvironment, contractName: string): Promise<boolean> {
  const { deployments } = hre;
  try {
    const existingContract = await deployments.get(contractName);
    if (existingContract.address) {
      console.log(contractName + ' already deployed at:', existingContract.address);
      return true;
    }
  } catch {
  }
  return false;
}

export async function txParams2() {
  return txParams(hreLocal, ethers.provider);
}

export async function txParams(hre: HardhatRuntimeEnvironment, provider: Provider) {
  const feeData = await provider.getFeeData();


  if (hre.network.name !== 'hardhat') {
    console.log('maxPriorityFeePerGas', formatUnits(feeData.maxPriorityFeePerGas?.toString() ?? '0', 9));
    console.log('maxFeePerGas', formatUnits(feeData.maxFeePerGas?.toString() ?? '0', 9));
    console.log('gas price:', formatUnits(feeData.gasPrice?.toString() ?? '0', 9));
  }

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    const maxPriorityFeePerGas = Number(feeData.maxPriorityFeePerGas ?? 1n);
    const maxFeePerGas = Number(feeData.maxFeePerGas ?? 1) * 2;
    return {
      maxPriorityFeePerGas: maxPriorityFeePerGas.toFixed(0),
      maxFeePerGas: maxFeePerGas.toFixed(0),
    };
  } else {
    return {
      gasPrice: (Number(feeData.gasPrice ?? 1) * 1.2).toFixed(0),
    };
  }
}

export async function getDeployedContractByName(name: string, revertIfNotFound = REVERT_IF_NOT_FOUND): Promise<string> {
  const { deployments } = hreLocal;
  let contract;
  try {
    contract = await deployments.get(name);
  } catch (e) {
  }
  if (!contract && revertIfNotFound) {
    throw new Error(`Contract ${name} not deployed`);
  }
  return contract?.address ?? '';
}

export async function deployAndUpdateIfNecessary(
  contractName: string,
  updateCallback: (logicAdr: string) => Promise<void>,
  libraries?: Libraries,
  isNeedUpdate?: (logicAdr: string) => Promise<boolean>,
) {
  const { deployments, getNamedAccounts } = hreLocal;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const prevDeploy = await getDeployedContractByName(contractName, false);
  const exist = await isContractExist(hreLocal, contractName);

  const newDeploy = await deploy(contractName, {
    contract: contractName,
    from: deployer,
    log: true,
    libraries,
    ...(await txParams(hreLocal, ethers.provider)),
  });

  let pushUpdate = false;

  if (isNeedUpdate) {
    pushUpdate = await isNeedUpdate(newDeploy.address);
  }


  // if new contracts exist we will not able to update them. need to deploy new contracts with skip-update and then run update again
  const skipUpdate = process.env.SKIP_UPDATE === 'true';
  if (!skipUpdate && exist && (prevDeploy.toLowerCase() !== newDeploy.address.toLowerCase() || pushUpdate)) {
    console.log('Update process for ' + contractName);
    await updateCallback(newDeploy.address);
  }

}

export async function isNeedUpdateProxyImplementation(proxy: string, logic: string) {
  if (!proxy || proxy.trim() === '') {
    return false;
  }
  const curImpl = await ProxyControlled__factory.connect(proxy, ethers.provider).implementation();
  const isNeedUpdate = curImpl.toLowerCase() !== logic.toLowerCase();
  if (isNeedUpdate) {
    console.log('>>> Proxy implementation changed!', proxy, curImpl, logic);
  }
  return isNeedUpdate;
}

export async function isNeedUpdateProxyImplementationByName(ctrName: string, logic: string) {
  const proxy = await getDeployedContractByName(ctrName, false);
  return isNeedUpdateProxyImplementation(proxy, logic);
}

export async function getDeployedCore(revertIfNotFound = false) {
  return new CoreAddresses(
    await getDeployedContractByName('TokenFactory', revertIfNotFound),
    await getDeployedContractByName('Controller', revertIfNotFound),
    await getDeployedContractByName('Gauge', revertIfNotFound),
    await getDeployedContractByName('XMyrd', revertIfNotFound),
  );
}

export async function deployOneInstanceProxy(
  hre: HardhatRuntimeEnvironment,
  deployments: DeploymentsExtension,
  deployer: string,
  name: string,
) {
  return deployments.deploy(name + 'Proxy', {
    contract: 'ProxyControlled',
    from: deployer,
    args: [await getDeployedContractByName(name)],
    log: true,
    skipIfAlreadyDeployed: true,
    ...(await txParams(hre, ethers.provider)),
  });
}