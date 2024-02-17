import { Logger } from 'tslog';
import logSettings from '../../log_settings';
import { config as dotEnvConfig } from 'dotenv';

// tslint:disable-next-line:no-var-requires
const hre = require('hardhat');
const log: Logger<undefined> = new Logger(logSettings);

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('')
  .options({
    networkScanKey: {
      type: 'string',
    },
  }).argv;

export class Verify {

  // ************** VERIFY **********************

  public static async verify(address: string) {
    try {
      await hre.run('verify:verify', {
        address,
      });
    } catch (e) {
      console.error(e);
      // log.info('error verify ' + e);
    }
  }

  // tslint:disable-next-line:no-any
  public static async verifyWithContractName(address: string, contractPath: string, args?: any[]) {
    console.log('verify', address, contractPath, args);
    try {
      await hre.run('verify:verify', {
        address, contract: contractPath, constructorArguments: args,
      });
    } catch (e) {
      console.error(e);
      // log.info('error verify ');
    }
  }

}
