import { ethers } from 'hardhat';
import { Logger } from 'tslog';
import logSettings from '../log_settings';
import { ContractTransaction, TransactionResponse } from 'ethers';
import { txParams2 } from '../deploy_helpers/deploy-helpers';

// tslint:disable-next-line:no-var-requires
const hre = require('hardhat');
const log: Logger<undefined> = new Logger(logSettings);

export class Misc {
  public static readonly DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';
  public static readonly MAX_UINT = BigInt(
    '115792089237316195423570985008687907853269984665640564039457584007913129639935');
  public static readonly SECONDS_OF_DAY = 60 * 60 * 24;
  public static readonly SECONDS_OF_YEAR = Misc.SECONDS_OF_DAY * 365;
  public static readonly ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  public static printDuration(text: string, start: number) {
    log.info('>>>' + text, ((Date.now() - start) / 1000).toFixed(1), 'sec');
  }

  public static isRealNetwork() {
    return hre.network.name !== 'hardhat'
      && hre.network.name !== 'anvil'
      && hre.network.name !== 'foundry';
  }

  public static async specificRpcDelay() {
    if (hre.network.name === 'imm_test') {
      await Misc.delay(500);
    }
  }

  public static getSubgraphUrl() {
    switch (hre.network.name) {
      case 'mumbai':
        return process.env.SUBGRAPH_URL_MUMBAI;
      case 'sepolia':
        return process.env.SUBGRAPH_URL_SEPOLIA;
      case 'op_sepolia':
        return process.env.SUBGRAPH_URL_OP_SEPOLIA;
      case 'sonict':
        return process.env.SUBGRAPH_URL_SEPOLIA; // todo change
      case 'foundry':
      case 'localhost':
        return process.env.SUBGRAPH_URL_LOCALHOST;
      default:
        throw Error('getSubgraphUrl unknown network ' + hre.network.name);
    }
  }

  public static async runAndWait(
    callback: () => Promise<TransactionResponse>,
    stopOnError = true,
    wait = true,
    waitBlocks = 1,
  ) {
    const start = Date.now();
    console.log('run and wait');
    const tr = await callback();
    console.log('tr executed');
    if (!wait) {
      Misc.printDuration('runAndWait completed', start);
      return;
    }
    if (waitBlocks !== 0 && hre.network.config.chainId !== 31337) {
      await Misc.wait(waitBlocks);
    }

    log.info('tx sent', tr.hash);

    let receipt;
    while (true) {
      receipt = await ethers.provider.getTransactionReceipt(tr.hash);
      if (!!receipt) {
        break;
      }
      if (Misc.isRealNetwork()) {
        log.info('not yet complete', tr.hash);
        await Misc.delay(10_000);
      }
    }
    log.info('transaction result', tr.hash, receipt?.status);
    log.info('gas used', receipt.gasUsed.toString());
    if (receipt?.status !== 1 && stopOnError) {
      throw Error('Wrong status!');
    }
    Misc.printDuration('runAndWait completed', start);
    return receipt;
  }

  public static async runAndWait2(
    txPopulated: Promise<ContractTransaction>,
    stopOnError = true,
    wait = true,
    waitBlocks = 1,
  ) {
    const tx = await txPopulated;
    const signer = (await ethers.getSigners())[0];
    const gas = Number(await signer.estimateGas(tx));

    const params = await txParams2();

    tx.gasLimit = BigInt((gas * 1.1).toFixed(0));

    tx.gasPrice = params.gasPrice ? BigInt(params.gasPrice) : undefined;
    tx.maxFeePerGas = params.maxFeePerGas ? BigInt(params.maxFeePerGas) : undefined;
    tx.maxPriorityFeePerGas = params.maxPriorityFeePerGas ? BigInt(params.maxPriorityFeePerGas) : undefined;

    if (hre.network.config.chainId !== 31337) {
      console.log('tx', tx);
    }

    return Misc.runAndWait(() => signer.sendTransaction(tx), stopOnError, wait, waitBlocks);
  }


  // ****************** WAIT ******************

  public static async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static async wait(blocks: number) {
    if (!Misc.isRealNetwork() || blocks === 0) {
      return;
    }
    const start = await ethers.provider.getBlockNumber();
    while (true) {
      if (await ethers.provider.getBlockNumber() >= start + blocks) {
        break;
      }
      if (Misc.isRealNetwork()) {
        await Misc.delay(1_000);
      }
    }
  }

}

export function numberToAddress(num: number) {
  return '0x' + num.toString(16).padStart(40, '0');
}

export function chance(n: number) {
  if (n > 100) {
    throw Error('chance is too high');
  }
  return ethers.parseUnits((n / 100).toFixed(18));
}

export function toByte32(str: string) {
  return ethers.encodeBytes32String(str);
}

export function isNetwork(chainId: number) {
  return hre.network.config.chainId === chainId;
}

export function isNetworkName(name: string) {
  return hre.network.name === name;
}

export function getNetworkName() {
  return hre.network.name;
}

export function toScreamingCase(inputString: string): string {
  // Remove any non-word characters except for numbers and apostrophes, replace spaces with underscores, and convert to uppercase
  const result = inputString
    .replace(/[^a-zA-Z0-9'\s]+/g, ' ') // Replace non-word characters except numbers and apostrophes with spaces
    .trim() // Remove leading and trailing spaces
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/'/g, '_') // Remove apostrophes
    .toUpperCase(); // Convert to uppercase

  return result;
}
