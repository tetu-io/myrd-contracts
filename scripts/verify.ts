import hre from 'hardhat';
import { Verify } from './deploy/Verify';

async function main() {

  await verify('ItemLib', 'contracts/lib');
  await verify('CalcLib', 'contracts/lib');
  await verify('ChamberLib', 'contracts/lib');
  await verify('DungeonLib', 'contracts/lib');
  await verify('ScoreLib', 'contracts/lib');
  await verify('StatLib', 'contracts/lib');
  await verify('StoryLib', 'contracts/lib');
  await verify('HeroBase', 'contracts/base');
  await verify('CommonStory', 'contracts/base/chamber');
  await verify('FightCalculator', 'contracts/calculators');
  await verify('ChamberController', 'contracts/core');
  await verify('Controller', 'contracts/core');
  await verify('DungeonFactory', 'contracts/core');
  await verify('Oracle', 'contracts/core');
  await verify('ReinforcementController', 'contracts/core');
  await verify('StatController', 'contracts/core');
  await verify('StoryController', 'contracts/core');
  await verify('Treasury', 'contracts/core');
  await verify('DungeonCommon', 'contracts/dungeons');
  await verify('CommonEvent', 'contracts/events');
  await verify('CommonEvent', 'contracts/events');
  await verify('ItemCommonMagicAttack', 'contracts/items');
  await verify('ItemCommonConsumable', 'contracts/items');
  await verify('ItemCommonBuff', 'contracts/items');
  await verify('ItemCommon', 'contracts/items');
  await verify('MonsterCommon', 'contracts/monsters');
  await verify('GameToken', 'contracts/token');
  await verify('Minter', 'contracts/token');

  await verify('ItemCalculator', 'contracts/calculators');
  await verify('HeroF2P', 'contracts/base');

}

async function verify(name: string, pkg?: string) {
  const { deployments } = hre;
  let ctr;
  try {
    ctr = await deployments.get(name);
  } catch (e) {
  }
  if (!ctr) {
    console.log('contract not found for ', name);
    return;
  }

  try {
    if (pkg) {
      await Verify.verifyWithContractName(ctr.address, `${pkg}/${name}.sol:${name}`);
    } else {
      await Verify.verify((await deployments.get(name)).address);
    }
  } catch (e) {
    console.log(e);
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
