import { TokenFactory__factory, LiquidityFactory, LiquidityFactory__factory, IWeightedPoolFactory__factory, ERC20__factory, MockWeth9__factory, IBVault__factory, IBPT__factory } from '../../typechain';
import {HardhatEthersSigner} from "@nomicfoundation/hardhat-ethers/signers";

export class BalancerUtils {
  public static readonly PAUSE_WINDOW_DURATION = 90n * 24n * 3600n
  public static readonly BUFFER_PERIOD_DURATION = 30n * 24n * 3600n

  public static async isPoolInited(bptAddress: string, signer: HardhatEthersSigner):Promise<boolean> {
    const bpt = IBPT__factory.connect(bptAddress, signer)
    const vaultAddress = await bpt.getVault()
    const vault = IBVault__factory.connect(vaultAddress, signer)
    const poolId = await bpt.getPoolId()
    const poolBalances = await vault.getPoolTokens(poolId)
    return poolBalances[1][0] != 0n
  }
}