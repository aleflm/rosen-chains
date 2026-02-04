import { randomBytes } from 'crypto';
import { TokenMap } from '@rosen-bridge/tokens';
import { EcdsaSignMediator } from '@rosen-chains/abstract-chain';
import { FiroChain, FiroConfigs } from '../lib'; // adjust import
import TestFiroNetwork from './network/testFiroNetwork';
import * as testData from './testData';

export const generateRandomId = (): string =>
  randomBytes(32).toString('hex');

export const configs: FiroConfigs = {
  fee: 1000000n,
  addresses: {
    lock: testData.lockAddress,
    cold: 'cold',
    permit: 'permit',
    fraud: 'fraud',
  },
  rwtId: 'firo-test-rwt-id',
  confirmations: {
    observation: 5,
    payment: 6,
    cold: 7,
    manual: 8,
    arbitrary: 9,
  },
  aggregatedPublicKey: testData.lockAddressPublicKey,
  txFeeSlippage: 10,
};

export const mockedSignMediator: EcdsaSignMediator = {
  sign: vi.fn(),
  isInSign: vi.fn().mockResolvedValue(true),
};

export const generateChainObject = async (
  network: TestFiroNetwork,
  signMediator: EcdsaSignMediator = mockedSignMediator,
) => {
  const tokenMap = new TokenMap();
  await tokenMap.updateConfigByJson(testData.testTokenMap);
  return new FiroChain(network, configs, tokenMap, signMediator);
};