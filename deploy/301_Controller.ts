import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import {Controller__factory} from "../typechain";
import {
  deployAndUpdateIfNecessary,
  getDeployedContractByName,
  isNeedUpdateProxyImplementationByName
} from "../deploy_helpers/deploy-helpers";
import { Misc } from '../scripts/Misc';

const CONTRACT_NAME = 'Controller';

const func: DeployFunction = async function(hre: HardhatRuntimeEnvironment) {
  console.log('start deploy ', CONTRACT_NAME);
  await deployAndUpdateIfNecessary(CONTRACT_NAME, async logicAdr => {
      const [signer] = await ethers.getSigners();
      const controller = Controller__factory.connect(await getDeployedContractByName('ControllerProxy'), signer);
      await Misc.runAndWait2(controller.updateProxies.populateTransaction([await controller.getAddress()], logicAdr));
    },
    undefined,
    async logic => isNeedUpdateProxyImplementationByName(CONTRACT_NAME + 'Proxy', logic),
  );
};
export default func;
func.tags = [CONTRACT_NAME];
func.dependencies = [
  "TokenFactory",
];