import { config as dotEnvConfig } from 'dotenv';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-verify';
// import "@nomiclabs/hardhat-web3";
// import "@nomiclabs/hardhat-solhint";
import '@typechain/hardhat';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import 'hardhat-abi-exporter';
import 'solidity-coverage';
import 'hardhat-deploy';
import { task } from 'hardhat/config';
import { deployContract } from './scripts/deploy/DeployContract';
import { deployAddresses } from './deploy_helpers/deploy-addresses';
import 'hardhat-ignore-warnings';

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('')
  .options({
    hardhatChainId: {
      type: 'number',
      default: 31337,
    },
    networkScanKey: {
      type: 'string',
    },
    networkScanKeySonic: {
      type: 'string',
    },
    privateKey: {
      type: 'string',
      default: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // random account
    },
    sonicRpcUrl: {
      type: 'string',
      default: 'https://rpc.soniclabs.com',
    },
    sonicForkBlock: {
      type: 'number',
      default: 0,
    },
    loggingEnabled: {
      type: 'boolean',
      default: false,
    },
  }).argv;

task('deploy1', 'Deploy contract', async function(args, hre, runSuper) {
  const [signer] = await hre.ethers.getSigners();
  // tslint:disable-next-line:ban-ts-ignore
  // @ts-ignore
  await deployContract(hre, signer, args.name);
}).addPositionalParam('name', 'Name of the smart contract to deploy');

export default {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: !!argv.hardhatChainId ? argv.hardhatChainId : undefined,
      timeout: 99999 * 2,
      blockGasLimit: 999_000_000,
      forking: !!argv.hardhatChainId && argv.hardhatChainId !== 31337 ? {
        url:
          argv.hardhatChainId === 146 ? argv.sonicRpcUrl :
            undefined,
        blockNumber:
          argv.hardhatChainId === 146 ? argv.sonicForkBlock || undefined : undefined,
      } : undefined,
      accounts: {
        mnemonic: 'test test test test test test test test test test test junk',
        path: 'm/44\'/60\'/0\'/0',
        accountsBalance: '100000000000000000000000000000',
      },
      loggingEnabled: argv.loggingEnabled,
      // chains: {
      //   778877: {
      //     hardforkHistory: {
      //       istanbul: 0,
      //     },
      //   }
      // },
    },
    sonic: {
      chainId: 146,
      url: argv.sonicRpcUrl,
      accounts: [argv.privateKey],
      timeout: 99999,
      verify: {
        etherscan: {
          apiKey: argv.networkScanKeySonic,
        },
      },
    },
  },
  etherscan: {
    apiKey: {
      sonic: argv.networkScanKeySonic,
    },
    customChains: [
      {
        network: 'sonic',
        chainId: 146,
        urls: {
          apiURL: 'https://api.sonicscan.org/api',
          browserURL: 'https://sonicscan.org',
        },
      },
    ],
  },
  solidity: {
    compilers: [
      {
        version: '0.8.23',
        settings: {
          // "evmVersion": "istanbul",
          optimizer: {
            enabled: true,
            runs: 150,
          },
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  mocha: {
    timeout: 9999999999,
  },
  contractSizer: {
    alphaSort: false,
    runOnCompile: false,
    disambiguatePaths: false,
  },
  gasReporter: {
    enabled: false,
    currency: 'USD',
    gasPrice: 21,
  },
  typechain: {
    outDir: 'typechain',
  },
  abiExporter: {
    path: './abi',
    runOnCompile: false,
    clear: true,
    flat: true,
    pretty: false,
  },
  namedAccounts: deployAddresses,
};
