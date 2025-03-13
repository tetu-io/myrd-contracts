import {Addresses} from "../../scripts/addresses/Addresses";
import {ethers} from "hardhat";

// tslint:disable-next-line:no-var-requires
const hre = require('hardhat');

export class DeployUtils {

  public static async impersonate(address: string | null = null) {
    if (address === null) {
      address = await Addresses.getGovernance();
    }

    const impersonatedSigner = await ethers.getImpersonatedSigner(address);

    await hre.network.provider.request({
      method: 'hardhat_setBalance',
      params: [address, '0x1431E0FAE6D7217CAA0000000'],
    });
    return impersonatedSigner;
  }

}