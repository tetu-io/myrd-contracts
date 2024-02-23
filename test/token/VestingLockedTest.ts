import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockToken } from '../../typechain';
import { TimeUtils } from '../TimeUtils';
import { ethers } from 'hardhat';
import { DeployerUtils } from '../../scripts/deploy/DeployerUtils';

const WEEK = 60 * 60 * 24 * 7;

describe('VestingLockedTest', function() {

  let snapshotBefore: string;
  let snapshot: string;

  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let owner3: SignerWithAddress;
  let token: MockToken;


  before(async function() {
    snapshotBefore = await TimeUtils.snapshot();
    [owner, owner2, owner3] = await ethers.getSigners();

    token = await DeployerUtils.deployMockToken(owner, 'TETU', 18, false);
  });

  after(async function() {
    await TimeUtils.rollback(snapshotBefore);
  });


  beforeEach(async function() {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function() {
    await TimeUtils.rollback(snapshot);
  });

  it('vesting with all attributes', async function() {
    // todo
  });

});
