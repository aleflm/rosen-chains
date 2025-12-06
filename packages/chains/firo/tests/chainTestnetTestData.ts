import { FiroConfigs } from '../lib/types';

// Firo testnet network parameters for bitcoinjs-lib
export const FIRO_TESTNET_NETWORK = {
  messagePrefix: '\x18Firocoin Signed Message:\n',
  bech32: 'tfiro',
  bip32: {
    public: 0x043587cf,
    private: 0x04358394,
  },
  pubKeyHash: 0x41, // Testnet addresses start with 'T'
  scriptHash: 0xb2,
  wif: 0xb9,
};

// Testnet addresses for testing
export const TESTNET_ADDRESSES = {
  lock: 'TBW8ZQvbMuANX72LT6dbvSjw7bxtS8csfX',
  mining: 'TQSu3aMZZtBuBkAwKSj9YbAZp6NJuMyVLB',
  cold: 'TLxyoka5jhUYeFPR1884VnbFvgU3Lg6cKQ',
  fee: 'TC1nE2ey4wE9YqgTqPT6MokPRtMmW5yTJz',
  permit: 'TCfKGgiz7bJZbjXmnS1S8S7EP3AQLsFdqB',
  fraud: 'TDRtAbqcjqMF24FYvdPVxfE1Kxi7Z1C2PL',
  payment: 'TBKuqHxabZSkyWrVWnajaJ4xExCRC5bcd3',
};

// Testnet Firo chain configuration
export const testnetFiroConfigs: FiroConfigs = {
  fee: 1000n,
  confirmations: {
    observation: 6,
    payment: 6,
    cold: 12,
    manual: 6,
    arbitrary: 6,
  },
  addresses: TESTNET_ADDRESSES,
  rwtId: 'firo-rwt-token-id',
  txFeeSlippage: 0.1,
  aggregatedPublicKey: '024d4cbb441095e6c71dd00e9afa6684223013cb1311b9be7a0f576813c21ac3f8',
};
