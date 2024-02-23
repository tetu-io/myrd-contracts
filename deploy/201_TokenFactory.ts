import { DeployFunction } from 'hardhat-deploy/dist/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDeployedContractByName, txParams } from '../deploy_helpers/deploy-helpers';
import { ethers } from 'hardhat';
import { parseUnits } from 'ethers';
import { ERC20__factory, MYRD__factory, TokenFactory__factory } from '../typechain';
import { Misc } from '../scripts/Misc';
import { expect } from 'chai';

const NAME = 'TokenFactory';

const PREFIX = '0x55555';

const MAINNET_GOV = '0x4bE13bf2B983C31414b358C634bbb61230c332A7';

const TREASURY_CLAIMANT = [MAINNET_GOV];
const TREASURY_CLAIM_AMOUNT = [parseUnits((35_000_000).toString())];

const TETU_CLAIMANT = [MAINNET_GOV];
const TETU_CLAIM_AMOUNT = [parseUnits((20_000_000).toString())];

const AMBASSADORS_CLAIMANTS = [
  '0x000000000000000000000000000000000000dead', // todo
];
const AMBASSADORS_CLAIM_AMOUNTS = [
  parseUnits((4_000_000).toString()), // todo
];

const SEED_CLAIMANTS = [
  '0x000000000000000000000000000000000000dead', // todo
];
const SEED_CLAIM_AMOUNTS = [
  parseUnits((10_000_000).toString()), // todo
];

const PRIVATE_CLAIMANTS = [
  '0x000000000000000000000000000000000000dead', // todo
];
const PRIVATE_CLAIM_AMOUNTS = [
  parseUnits((10_000_000).toString()), // todo
];

const TEAM_CLAIMANT = [MAINNET_GOV];
const TEAM_CLAIM_AMOUNT = [parseUnits((20_000_000).toString())];


const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

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

    const vestingContracts = [
      await getDeployedContractByName('VestingTreasury'),
      await getDeployedContractByName('VestingTetuPart'),
      await getDeployedContractByName('VestingAmbassadors'),
      await getDeployedContractByName('VestingSeed'),
      await getDeployedContractByName('VestingPrivate'),
      await getDeployedContractByName('VestingTeam'),
    ];

    const claimants = [
      TREASURY_CLAIMANT, // Treasury
      TETU_CLAIMANT, // Tetu
      AMBASSADORS_CLAIMANTS, // Ambassadors
      SEED_CLAIMANTS, // Seed
      PRIVATE_CLAIMANTS, // Private
      TEAM_CLAIMANT, // Team
    ];

    const amounts = [
      TREASURY_CLAIM_AMOUNT, // Treasury
      TETU_CLAIM_AMOUNT, // Tetu
      AMBASSADORS_CLAIM_AMOUNTS, // Ambassadors
      SEED_CLAIM_AMOUNTS, // Seed
      PRIVATE_CLAIM_AMOUNTS, // Private
      TEAM_CLAIM_AMOUNT, // Team
    ];

    const bytecode = MYRD__factory.bytecode;
    let salt = ethers.randomBytes(32);

    // skip generate for tests
    if (hre.network.name !== 'hardhat') {
      while (true) {
        salt = ethers.randomBytes(32);
        const address = ethers.getCreate2Address(await factory.getAddress(), salt, ethers.keccak256(bytecode));
        console.log('Try Address:', address);
        if (address.startsWith(PREFIX)) {
          break;
        }
      }
    }

    const gas = await factory.createToken.estimateGas(
      salt,
      bytecode,
      vestingContracts,
      claimants,
      amounts,
    );

    expect(gas).lt(25_000_000n, 'Gas limit is too high');

    console.log('Create MYRD token', gas);
    await Misc.runAndWait2(factory.createToken.populateTransaction(
      salt,
      bytecode,
      vestingContracts,
      claimants,
      amounts,
    ));
    console.log('Token created');

    const token = ERC20__factory.connect(await factory.token(), ethers.provider);
    console.log('MYRD address:', await token.getAddress());

    expect(await token.balanceOf(signer.address)).to.eq(parseUnits((1_000_000).toString()));
    expect(await token.balanceOf(vestingContracts[0])).to.eq(parseUnits((35_000_000).toString()));
    expect(await token.balanceOf(vestingContracts[1])).to.eq(parseUnits((20_000_000).toString()));
    expect(await token.balanceOf(vestingContracts[2])).to.eq(parseUnits((4_000_000).toString()));
    expect(await token.balanceOf(vestingContracts[3])).to.eq(parseUnits((10_000_000).toString()));
    expect(await token.balanceOf(vestingContracts[4])).to.eq(parseUnits((10_000_000).toString()));
    expect(await token.balanceOf(vestingContracts[5])).to.eq(parseUnits((20_000_000).toString()));


  }
};
export default func;
func.tags = [NAME];
