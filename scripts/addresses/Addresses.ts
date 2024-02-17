import { ethers } from 'hardhat';

// tslint:disable-next-line:no-var-requires
const hre = require('hardhat');

export class Addresses {

  private static GOVERNANCE = new Map<bigint, string>([
    [5n, '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94'],
    [11155111n, '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94'],
    [778877n, '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94'],
    [1351057110n, '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94'],
    [80001n, '0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94'],
  ]);

  private static NETWORK_TOKEN = new Map<bigint, string>([
    [80001n, '0x0000000000000000000000000000000000001010'],
  ]);

  public static async getGovernance() {
    const net = await ethers.provider.getNetwork();
    const gov = Addresses.GOVERNANCE.get(net.chainId);
    if (!gov) {
      throw Error('No config for ' + net.chainId);
    }
    return gov;
  }

  public static async getNetworkToken() {
    const net = await ethers.provider.getNetwork();
    const gov = Addresses.NETWORK_TOKEN.get(net.chainId);
    if (!gov) {
      throw Error('No config for ' + net.chainId);
    }
    return gov;
  }

}
