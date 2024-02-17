import { ContractFactory } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Logger } from 'tslog';
import logSettings from '../../log_settings';
import { Libraries } from '@nomicfoundation/hardhat-ethers/types';

const log: Logger<undefined> = new Logger(logSettings);

const libraries = new Map<string, string[]>([

]);

export async function deployContract<T extends ContractFactory>(
  // tslint:disable-next-line
  hre: any,
  signer: SignerWithAddress,
  name: string,
  // tslint:disable-next-line:no-any
  ...args: any[]
) {
  if (hre.network.name !== 'hardhat' && hre.network.name !== 'foundry' && hre.network.name !== 'anvil') {
    await hre.run('compile');
  }
  const ethers = hre.ethers;
  log.info(`Deploying ${name}`);
  log.info('Account balance: ' + ethers.formatUnits(await signer.provider.getBalance(signer.address), 18));

  let gasPrice = ((await signer.provider.getFeeData()).gasPrice ?? 0n);
  log.info('Gas price: ' + ethers.formatUnits(gasPrice, 9));

  if (hre.network.name === 'goerli') {
    while (true) {
      if (+ethers.formatUnits(gasPrice, 9) < 2) {
        break;
      } else {
        console.log('Wait for good gas price');
        await delay(60_000);
      }
      gasPrice = ((await signer.provider.getFeeData()).gasPrice ?? 0n);
      log.info('Gas price: ' + ethers.formatUnits(gasPrice, 9));
    }
  }

  if (+ethers.formatUnits(gasPrice, 9) === 0) {
    gasPrice = ethers.parseUnits('1', 9);
  }


  const libs: string[] | undefined = libraries.get(name);
  let _factory;
  if (libs) {
    const librariesObj: Libraries = {};
    for (const lib of libs) {
      log.info('DEPLOY LIBRARY', lib, 'for', name);
      librariesObj[lib] = await (await deployContract(hre, signer, lib)).getAddress();
    }

    _factory = (await ethers.getContractFactory(
      name,
      {
        signer,
        libraries: librariesObj,
      },
    )) as T;
  } else {
    _factory = (await ethers.getContractFactory(
      name,
      signer,
    )) as T;
  }
  // let gas = 5_000_000;
  // if (hre.network.name === 'hardhat') {
  //   gas = 999_999_999;
  // } else if (hre.network.name === 'mumbai') {
  //   gas = 5_000_000;
  // }
  // const instance = await _factory.deploy(...args, {gasLimit: gas, gasPrice: Math.floor(+gasPrice * 1.1)});
  const instance = await _factory.deploy(...args, { gasLimit: 19_000_000, gasPrice: (gasPrice * 11n / 10n) });
  log.info('Deploy tx:', instance.deploymentTransaction()?.hash);

  await instance.waitForDeployment();

  const receipt = await ethers.provider.getTransactionReceipt(instance.deploymentTransaction()?.hash);
  console.log('DEPLOYED: ', name, receipt.contractAddress);

  // if (hre.network.name !== 'hardhat' && hre.network.name !== 'goerli' && hre.network.name !== 'zktest') {
  //   await wait(hre, 2);
  //   if (args.length === 0) {
  //     await verify(hre, receipt.contractAddress);
  //   } else {
  //     await verifyWithArgs(hre, receipt.contractAddress, args);
  //   }
  // }
  return _factory.attach(receipt.contractAddress);
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// tslint:disable-next-line:no-any
async function verify(hre: any, address: string) {
  try {
    await hre.run('verify:verify', {
      address,
    });
  } catch (e) {
    log.info('error verify ' + e);
  }
}

// tslint:disable-next-line:no-any
async function verifyWithArgs(hre: any, address: string, args: any[]) {
  try {
    await hre.run('verify:verify', {
      address, constructorArguments: args,
    });
  } catch (e) {
    log.info('error verify ' + e);
  }
}


