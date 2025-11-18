import { AbstractLogger } from '@rosen-bridge/abstract-logger';
import { FiroConfigs, TssSignFunction } from '../lib/types';
import JsonBigInt from '@rosen-bridge/json-bigint';

// Firo RPC configuration for production tests
export const FIRO_CONFIG = {
  rpcUrl: 'http://127.0.0.1:8888',
  rpcUser: 'firouser',
  rpcPassword: 'firopwd',
};

// Expected values for chain constants
export const EXPECTED_CHAIN_VALUES = {
  CHAIN: 'firo',
  NATIVE_TOKEN_ID: 'firo',
  MINIMUM_UTXO_VALUE: 1000000n,
};

// Test event IDs for various test scenarios
export const TEST_EVENT_IDS = {
  basic: 'test-event',
  json: 'json-test-event',
  empty: 'empty-event',
  assets: 'asset-test-event',
  duplicate: 'duplicate-event',
  emptyUtxos: 'empty-utxos-event',
  validity: 'validity-test-event',
};

// Test transaction IDs for various test scenarios
export const TEST_TRANSACTION_IDS = {
  empty: 'empty-tx-id',
  duplicate: 'duplicate-test-tx',
  validity: 'test-tx-id',
};

// Mock UTXO test data for getTransactionAssets tests
export const MOCK_UTXOS = {
  standard: [
    JsonBigInt.stringify({ txId: 'input-tx-1', index: 0, value: BigInt(100000000) }), // 1 FIRO
    JsonBigInt.stringify({ txId: 'input-tx-2', index: 1, value: BigInt(200000000) }), // 2 FIRO
    JsonBigInt.stringify({ txId: 'input-tx-3', index: 0, value: BigInt(150000000) }), // 1.5 FIRO
  ],
  duplicate: [
    JsonBigInt.stringify({ txId: 'dup-tx-1', index: 0, value: BigInt(100000000) }),
    JsonBigInt.stringify({ txId: 'dup-tx-1', index: 0, value: BigInt(100000000) }), // Duplicate
    JsonBigInt.stringify({ txId: 'dup-tx-2', index: 1, value: BigInt(50000000) }),
  ],
  empty: [],
  jsonTest: ['test-utxo-1', 'test-utxo-2'],
};

// Expected totals for UTXO calculations
export const EXPECTED_UTXO_TOTALS = {
  standard: BigInt(450000000), // 100000000 + 200000000 + 150000000 = 4.5 FIRO
  duplicate: BigInt(150000000), // Deduplicated: 100000000 + 50000000 = 1.5 FIRO
  empty: 0n,
};

// Mock transaction bytes for testing
export const MOCK_TRANSACTION_BYTES = {
  minimal: new Uint8Array(Buffer.from('0200000001', 'hex')),
  empty: new Uint8Array(0),
  invalidPsbt: new Uint8Array([0x01, 0x02, 0x03]),
};

// Factory function to create mock FiroConfigs (addresses will be filled from RPC)
export const createTestFiroConfigs = (realAddresses: string[]): FiroConfigs => ({
  fee: 1000n,
  confirmations: {
    observation: 1,
    payment: 1,
    cold: 2,
    manual: 1,
    arbitrary: 1,
  },
  addresses: {
    lock: realAddresses[0],
    cold: realAddresses[1],
    fee: realAddresses[2],
    permit: realAddresses[3],
    fraud: realAddresses[4],
  },
  rwtId: 'firo-rwt',
  txFeeSlippage: 0.1,
  aggregatedPublicKey: '03a452f79511629afbbe437e0eb69f5cd4c3d0a331fbe386c170a5939eb3f3fe6e',
});

// Mock network object for FiroChain tests
export const createMockNetwork = (): any => ({
  getHeight: async () => 1000,
  getTxConfirmation: async () => 6,
  getAddressAssets: async () => ({ '': BigInt(1000000000) }),
  getBlockTransactionIds: async () => [],
  getBlockInfo: async () => ({ hash: 'test', parentHash: '', height: 1000 }),
  getTransaction: async () => null,
  submitTransaction: async () => {},
  getAddressBoxes: async () => [],
  isBoxUnspentAndValid: async () => true,
  getUtxo: async () => ({ 
    txId: 'test-tx', 
    index: 0, 
    value: 100000000n, 
    address: 'test-address', 
    scriptPubKey: 'test-script' 
  }),
  getFeeRatio: async () => 1000,
  isTxInMempool: async () => false,
  getTransactionHex: async () => '',
  getMempoolTransactions: async () => [],
  getTokenDetail: async () => null,
  getActualTxId: async (txId: string) => txId,
  logger: {} as AbstractLogger,
});

// Alternative mock network that returns false for isBoxUnspentAndValid
export const createInvalidMockNetwork = (): any => ({
  ...createMockNetwork(),
  isBoxUnspentAndValid: async (boxId: string) => false,
});

// Mock token map for FiroChain tests
export const createMockTokenMap = (): any => ({
  wrapAmount: (tokenId: string, amount: bigint, chain: string) => ({ amount, token: tokenId }),
  unwrapAmount: (tokenId: string, amount: bigint, chain: string) => ({ amount, token: tokenId }),
  search: () => null,
  getID: () => 'firo',
  getTokenName: () => 'Firo',
});

// Mock TSS sign function for FiroChain tests
export const createMockTssSignFunction = (): TssSignFunction => 
  async (txHash: Uint8Array) => ({
    signature: 'test-signature',
    signatureRecovery: 'test-recovery',
  });

// Mock logger for FiroChain tests
export const createMockLogger = (): AbstractLogger => ({
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
});

// Test error messages
export const ERROR_MESSAGES = {
  malformedJson: 'invalid-json',
};