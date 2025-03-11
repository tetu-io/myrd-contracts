// tslint:disable-next-line:no-var-requires
import { ContractFactory, parseUnits } from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Deploy } from './Deploy';
import { MockToken } from '../../typechain';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Misc } from '../Misc';

const MONTH = 30n * 24n * 3600n;

export class DeployerUtils {

  // ************ CONTRACT DEPLOY **************************

  public static async deployContract<T extends ContractFactory>(
    signer: SignerWithAddress,
    name: string,
    // tslint:disable-next-line:no-any
    ...args: any[]
  ) {
    const deploy = new Deploy(signer);
    return deploy.deployContract(name, ...args);
  }

  public static async deployMockToken(signer: SignerWithAddress, name = 'MOCK', decimals = 18, premint = true) {
    const token = await DeployerUtils.deployContract(signer, 'MockToken', name + '_MOCK_TOKEN', name) as MockToken;
    if (premint) {
      await Misc.runAndWait2(token.mint.populateTransaction(signer.address, parseUnits('100000000', decimals)));
    }
    return token;
  }

  public static async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static createFolderAndWriteFileSync(targetFile: string, data: string) {
    const dir = path.dirname(targetFile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(targetFile, data, 'utf8');
    console.log('+Data written to', targetFile);
  }
}
