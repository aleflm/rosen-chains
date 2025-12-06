import { FiroConfigs } from '../lib/types';

// Mainnet Firo chain configs for on mainnet testing
// Note: These are placeholder addresses - update with actual funded addresses before running tests
export const mainnetFiroConfigs: FiroConfigs = {
  fee: 1000n,
  confirmations: {
    observation: 6,
    payment: 6,
    cold: 12,
    manual: 6,
    arbitrary: 6,
  },
  addresses: {
    lock: 'aD5CwCytFCw8AE76rDiAKQqHghNatNLU4X',
    cold: 'aD5CwCytFCw8AE76rDiAKQqHghNatNLU4Y',
    fee: 'aD5CwCytFCw8AE76rDiAKQqHghNatNLU4Z',
    permit: 'aD5CwCytFCw8AE76rDiAKQqHghNatNLU5A',
    fraud: 'aD5CwCytFCw8AE76rDiAKQqHghNatNLU5B',
  },
  rwtId: 'firo-rwt-token-id',
  txFeeSlippage: 0.1,
  aggregatedPublicKey:
    '03a452f79511629afbbe437e0eb69f5cd4c3d0a331fbe386c170a5939eb3f3fe6e',
};
