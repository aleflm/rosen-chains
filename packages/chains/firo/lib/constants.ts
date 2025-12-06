export const FIRO_CHAIN = 'firo';
export const FIRO = 'firo';

export const CONFIRMATION_TARGET = 10;

// New constants
export const FIRO_TX_BASE_SIZE = 10; // Firo base transaction size in bytes
export const FIRO_INPUT_SIZE = 148; // Typical Firo input size in bytes (non-SegWit)
export const FIRO_OUTPUT_SIZE = 34; // Typical Firo output size in bytes
export const MINIMUM_UTXO_VALUE = 1000000n; // Minimum Firo UTXO value in satoshis

// Firo mainnet network parameters
export const FIRO_NETWORK = {
  messagePrefix: '\x18Firocoin Signed Message:\n',
  bech32: 'firo',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4,
  },
  pubKeyHash: 0x52, // Mainnet addresses start with 'a'
  scriptHash: 0x07,
  wif: 0xd2,
};

// Firo testnet network parameters
export const FIRO_TESTNET = {
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

// Detect network from address format
export function detectFiroNetwork(address: string) {
  if (address.startsWith('T')) {
    return FIRO_TESTNET;
  }
  return FIRO_NETWORK;
}
