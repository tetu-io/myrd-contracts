// tslint:disable-next-line:no-var-requires
import {AbiCoder, ContractFactory, parseEther, parseUnits, ZeroAddress} from 'ethers';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Deploy } from './Deploy';
import {MockToken, Vault, Vault__factory, WeightedPool} from '../../typechain';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Misc } from '../Misc';
import {BalancerUtils} from "../utils/balancer-utils";

const MONTH = 30n * 24n * 3600n

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

  public static async deployBalancer(
    signer: SignerWithAddress,
    pauseWindowDuration = BalancerUtils.PAUSE_WINDOW_DURATION,
    bufferPeriodDuration = BalancerUtils.BUFFER_PERIOD_DURATION
  ) {

    const entrypoint = await this.deployContract(signer, 'MockAuthorizerAdaptorEntrypoint');
    const authorizer = await this.deployContract(signer, 'TimelockAuthorizer', signer.address, await entrypoint.getAddress(), MONTH);

    const netToken = await DeployerUtils.deployMockToken(signer, 'WETH');

    const vault = await DeployerUtils.deployContract(signer, 'Vault',
      await authorizer.getAddress(),
      await netToken.getAddress(),
      pauseWindowDuration,
      bufferPeriodDuration
    ) as Vault;


    const protocolFeePercentagesProvider = await this.deployContract(signer, 'ProtocolFeePercentagesProvider', await vault.getAddress(), parseUnits('0.01', 18), parseUnits('0.01', 18))

    return {
      authorizer,
      vault,
      netToken,
      protocolFeePercentagesProvider,
    }
  }

  public static async deployAndInitBalancerWeightedPool(
    signer: SignerWithAddress,
    vaultAddress: string,
    protocolFeePercentagesProviderAddress: string,
    tokens: MockToken[],
    normalizedWeights: bigint[],
    initialBalances: bigint[],
    swapFeePercentage = parseEther('0.0025'),
    pauseWindowDuration = BalancerUtils.PAUSE_WINDOW_DURATION,
    bufferPeriodDuration = BalancerUtils.BUFFER_PERIOD_DURATION
  ) {
    // const protocolFeeCollector = await Vault__factory.connect(vaultAddress, signer).getProtocolFeesCollector()

    const weightedPoolParams = [
      {
        name: 'Balancer Weighted Pool',
        symbol: 'B-WEIGHTED',
        tokens: tokens.map(async t => await t.getAddress()),
        normalizedWeights,
        rateProviders: tokens.map(() => ZeroAddress),
        assetManagers: tokens.map(() => ZeroAddress),
        swapFeePercentage,
      },
      vaultAddress,
      protocolFeePercentagesProviderAddress,
      pauseWindowDuration,
      bufferPeriodDuration,
      signer.address
    ];

    const weightedPool = await DeployerUtils.deployContract(signer, 'WeightedPool',
      ...weightedPoolParams) as WeightedPool;

    const vault = Vault__factory.connect(vaultAddress, signer);

    for (let i = 0; i < tokens.length; i++) {
      await tokens[i].connect(signer).approve(vaultAddress, initialBalances[i])
    }

    const JOIN_KIND_INIT = 0;

    const initUserData = AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256[]"],
      [JOIN_KIND_INIT, initialBalances]
    );

    const joinPoolRequest = {
      assets: tokens.map(async t => await t.getAddress()),
      maxAmountsIn: initialBalances,
      userData: initUserData,
      fromInternalBalance: false
    }

    const poolId = await weightedPool.getPoolId();
    await vault.joinPool(poolId, signer.address, signer.address, joinPoolRequest);
    return weightedPool;
  }

}
