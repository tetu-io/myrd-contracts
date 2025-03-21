import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDeployedContractByName, txParams } from '../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';
import { parseUnits } from 'ethers';
import { ERC20__factory, MYRD__factory, TokenFactory__factory } from '../typechain';
import { Misc } from '../scripts/Misc';
import { expect } from 'chai';
import {config as dotEnvConfig} from "dotenv";
import { TOKEN_PREFIX } from '../deploy_helpers/sale.config';

const NAME = 'TokenFactory';


dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('')
  .options({
    salt: {
      type: "string",
    },
  }).argv;


const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, GOVERNANCE } = await getNamedAccounts();

  ////////////////////////////////////

  const GOV = GOVERNANCE;

  ////////////////////////////////////

  const result = await deploy(NAME, {
    contract: 'TokenFactory',
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    ...(await txParams(hre, ethers.provider)),
  });

  const signer = (await ethers.getSigners())[0];
  const factory = TokenFactory__factory.connect(result.address, signer);


  if ((await factory.token()) === Misc.ZERO_ADDRESS) {

    const bytecode = MYRD__factory.bytecode;
    let salt = ethers.randomBytes(32);

    if(argv.salt && argv.salt !== '') {
      const  a = JSON.parse('[' + (argv.salt).toString() + ']')
      console.log('SALT pure array:', a);
      salt = Uint8Array.from(a);
    }


    // skip generate for tests
    if (hre.network.name !== 'hardhat') {
      while (true) {
        const address = ethers.getCreate2Address(await factory.getAddress(), salt, ethers.keccak256(bytecode));
        console.log('Try Address:', address);
        if (address.startsWith(TOKEN_PREFIX)) {
          break;
        }
        salt = ethers.randomBytes(32);
      }
    }

    console.log('SALT:', salt.toString());

    if (!ethers.getCreate2Address(await factory.getAddress(), salt, ethers.keccak256(bytecode)).startsWith(TOKEN_PREFIX)) {
      throw new Error('Invalid salt');
    }

    const sale = await getDeployedContractByName('Sale');
    const vestingTeam = await getDeployedContractByName('VestingTeam');
    const vestingTreasury = await getDeployedContractByName('VestingTreasury');
    const vestingRewards = await getDeployedContractByName('VestingRewards');


    const gas = await factory.createToken.estimateGas(
      salt,
      bytecode,
      GOV,
      sale,
      vestingTeam,
      vestingTreasury,
      vestingRewards,
    );

    expect(gas).lt(25_000_000n, 'Gas limit is too high');

    console.log('Create MYRD token', gas);
    await Misc.runAndWait2(factory.createToken.populateTransaction(
      salt,
      bytecode,
      GOV,
      sale,
      vestingTeam,
      vestingTreasury,
      vestingRewards,
    ));
    console.log('Token created');

    const token = ERC20__factory.connect(await factory.token(), ethers.provider);
    console.log('MYRD address:', await token.getAddress());

    expect(await token.balanceOf(sale)).to.eq(parseUnits((4_000_000).toString()));
    expect(await token.balanceOf(GOV)).to.eq(parseUnits((6_000_000).toString()));
  }
};
export default func;
func.tags = [NAME];
func.dependencies = [
  'Sale',
  'VestingTeam',
  'VestingTreasury',
  'VestingRewards',
];
