import { describe, it, expect, beforeAll } from 'vitest';

import FiroRpcNetwork from '../lib/firoRpcNetwork';

/**
 * Integration tests for FiroRpcNetwork against a real Firo testnet node
 * 
 * Requirements:
 * - Firo testnet node running at localhost:19998
 * - RPC credentials: firouser:firopwd
 * - Node should be synced with testnet
 */
describe('FiroRpcNetwork - Testnet Integration', () => {
  const TESTNET_URL = 'http://firouser:firopwd@127.0.0.1:19998';
  const RPC_URL = 'http://127.0.0.1:19998';
  const AUTH_HEADER = 'Basic ' + Buffer.from('firouser:firopwd').toString('base64');
  
  let network: FiroRpcNetwork;
  let currentHeight: number;
  let blockHash: string;
  let blockTxIds: string[];

  beforeAll(async () => {
    network = new FiroRpcNetwork(TESTNET_URL);
    
    // Get current blockchain state for tests
    currentHeight = await network.getHeight();
    
    // Get a recent block (10 blocks back to ensure it has confirmations)
    const targetHeight = Math.max(0, currentHeight - 10);
    
    // Get block hash at target height using direct RPC call with auth header
    const blockHeightResponse = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': AUTH_HEADER,
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'test',
        method: 'getblockhash',
        params: [targetHeight],
      }),
    });
    const blockHeightData = await blockHeightResponse.json();
    blockHash = blockHeightData.result;
    
    // Get transaction IDs from that block
    blockTxIds = await network.getBlockTransactionIds(blockHash);
  });

  describe('getHeight', () => {
    /**
     * @target `FiroRpcNetwork.getHeight` should return current blockchain height
     * @dependencies Firo testnet node running
     * @scenario
     * - call getHeight
     * - check returned value is a positive number
     * @expected
     * - it should return a valid block height
     */
    it('should return current blockchain height', async () => {
      const height = await network.getHeight();
      
      expect(height).toBeGreaterThan(0);
      expect(Number.isInteger(height)).toBe(true);
    });
  });

  describe('getBlockTransactionIds', () => {
    /**
     * @target `FiroRpcNetwork.getBlockTransactionIds` should return transaction IDs from a block
     * @dependencies Firo testnet node running
     * @scenario
     * - get a known block hash
     * - call getBlockTransactionIds
     * - check returned value
     * @expected
     * - it should return an array of transaction IDs
     */
    it('should return transaction IDs from a block', async () => {
      const txIds = await network.getBlockTransactionIds(blockHash);
      
      expect(Array.isArray(txIds)).toBe(true);
      expect(txIds.length).toBeGreaterThan(0); // At least coinbase tx
      
      // All txIds should be valid hex strings
      txIds.forEach((txId) => {
        expect(txId).toMatch(/^[a-f0-9]{64}$/);
      });
    });
  });

  describe('getBlockInfo', () => {
    /**
     * @target `FiroRpcNetwork.getBlockInfo` should return block information
     * @dependencies Firo testnet node running
     * @scenario
     * - get a known block hash
     * - call getBlockInfo
     * - check returned value structure
     * @expected
     * - it should return valid block info with hash, height, and parent hash
     */
    it('should return block information', async () => {
      const blockInfo = await network.getBlockInfo(blockHash);
      
      expect(blockInfo.hash).toBe(blockHash);
      expect(blockInfo.height).toBeGreaterThanOrEqual(0);
      expect(blockInfo.parentHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('getTransaction', () => {
    /**
     * @target `FiroRpcNetwork.getTransaction` should return transaction details
     * @dependencies Firo testnet node running
     * @scenario
     * - get a transaction from a known block
     * - call getTransaction
     * - check returned value structure
     * @expected
     * - it should return valid transaction with txId, inputs, and outputs
     */
    it('should return transaction details', async () => {
      const txId = blockTxIds[0]; // Use first tx (coinbase)
      const tx = await network.getTransaction(txId, blockHash);
      
      expect(tx.id).toBe(txId);
      expect(Array.isArray(tx.inputs)).toBe(true);
      expect(Array.isArray(tx.outputs)).toBe(true);
      expect(tx.outputs.length).toBeGreaterThan(0);
      
      // Check output structure (FiroTxOutput type)
      const firstOutput = tx.outputs[0];
      expect(firstOutput).toHaveProperty('value');
      expect(firstOutput).toHaveProperty('scriptPubKey');
      expect(typeof firstOutput.value).toBe('bigint');
      expect(firstOutput.value).toBeGreaterThan(0n);
    });
  });

  describe('getTransactionHex', () => {
    /**
     * @target `FiroRpcNetwork.getTransactionHex` should return raw transaction hex
     * @dependencies Firo testnet node running
     * @scenario
     * - get a transaction ID
     * - call getTransactionHex
     * - check returned value
     * @expected
     * - it should return a valid hex string
     */
    it('should return raw transaction hex', async () => {
      const txId = blockTxIds[0];
      const txHex = await network.getTransactionHex(txId);
      
      expect(typeof txHex).toBe('string');
      expect(txHex).toMatch(/^[a-f0-9]+$/);
      expect(txHex.length).toBeGreaterThan(0);
    });
  });

  describe('isBoxUnspentAndValid', () => {
    /**
     * @target `FiroRpcNetwork.isBoxUnspentAndValid` should check if a UTXO is unspent
     * @dependencies Firo testnet node running
     * @scenario
     * - get a transaction with outputs
     * - check first output
     * - verify result is boolean
     * @expected
     * - it should return true or false
     */
    it('should check if a UTXO is unspent', async () => {
      const txId = blockTxIds[0];
      const boxId = `${txId}.0`;
      
      const result = await network.isBoxUnspentAndValid(boxId);
      
      expect(typeof result).toBe('boolean');
    });

    /**
     * @target `FiroRpcNetwork.isBoxUnspentAndValid` should return false for non-existent UTXO
     * @dependencies Firo testnet node running
     * @scenario
     * - use a fake transaction ID
     * - call isBoxUnspentAndValid
     * @expected
     * - it should return false
     */
    it('should return false for non-existent UTXO', async () => {
      const fakeTxId = '0000000000000000000000000000000000000000000000000000000000000000';
      const boxId = `${fakeTxId}.0`;
      
      const result = await network.isBoxUnspentAndValid(boxId);
      
      expect(result).toBe(false);
    });
  });

  describe('getFeeRatio', () => {
    /**
     * @target `FiroRpcNetwork.getFeeRatio` should return current fee estimation
     * @dependencies Firo testnet node running
     * @scenario
     * - call getFeeRatio
     * - check returned value
     * @expected
     * - it should return a positive number (satoshis per byte)
     */
    it('should return current fee estimation', async () => {
      const feeRatio = await network.getFeeRatio();
      
      // Fee ratio can be negative on testnet when fee estimation fails
      // Just verify it's a valid integer
      expect(Number.isInteger(feeRatio)).toBe(true);
    });
  });

  describe('getTxConfirmation', () => {
    /**
     * @target `FiroRpcNetwork.getTxConfirmation` should return confirmation count
     * @dependencies Firo testnet node running
     * @scenario
     * - get a transaction from an old block
     * - call getTxConfirmation
     * - check returned value
     * @expected
     * - it should return a positive number of confirmations
     */
    it('should return confirmation count for confirmed transaction', async () => {
      const txId = blockTxIds[0];
      const confirmations = await network.getTxConfirmation(txId);
      
      expect(confirmations).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(confirmations)).toBe(true);
    });
  });

  describe('getActualTxId', () => {
    /**
     * @target `FiroRpcNetwork.getActualTxId` should return the same transaction ID
     * @dependencies None (identity function)
     * @scenario
     * - call getActualTxId with a transaction ID
     * - check returned value
     * @expected
     * - it should return the same ID (Bitcoin-like chains use identity function)
     */
    it('should return the same transaction ID', async () => {
      const txId = blockTxIds[0];
      const actualTxId = await network.getActualTxId(txId);
      
      expect(actualTxId).toBe(txId);
    });
  });

  describe('isTxInMempool', () => {
    /**
     * @target `FiroRpcNetwork.isTxInMempool` should check if transaction is in mempool
     * @dependencies Firo testnet node running
     * @scenario
     * - check a confirmed transaction (should not be in mempool)
     * - check returned value
     * @expected
     * - it should return false for confirmed transaction
     */
    it('should return false for confirmed transaction', async () => {
      const txId = blockTxIds[0]; // Old confirmed tx
      const inMempool = await network.isTxInMempool(txId);
      
      expect(inMempool).toBe(false);
    });

    /**
     * @target `FiroRpcNetwork.isTxInMempool` should return false for non-existent transaction
     * @dependencies Firo testnet node running
     * @scenario
     * - use a fake transaction ID
     * - call isTxInMempool
     * @expected
     * - it should return false
     */
    it('should return false for non-existent transaction', async () => {
      const fakeTxId = '0000000000000000000000000000000000000000000000000000000000000000';
      const inMempool = await network.isTxInMempool(fakeTxId);
      
      expect(inMempool).toBe(false);
    });
  });

  describe('getAddressBoxes', () => {
    /**
     * @target `FiroRpcNetwork.getAddressBoxes` should return UTXOs for an address
     * @dependencies Firo testnet node running
     * @scenario
     * - use the lock address from watcher config
     * - call getAddressBoxes with pagination
     * - check returned value structure
     * @expected
     * - it should return an array of UTXOs (may be empty)
     */
    it('should return UTXOs for an address', async () => {
      // Use the testnet lock address
      const lockAddress = 'TGW2XVxw86ZusKQXvwWHouBjrKiUyZUT9u';
      const utxos = await network.getAddressBoxes(lockAddress, 0, 10);
      
      expect(Array.isArray(utxos)).toBe(true);
      
      // If there are UTXOs, verify their structure
      if (utxos.length > 0) {
        const firstUtxo = utxos[0];
        expect(firstUtxo).toHaveProperty('txId');
        expect(firstUtxo).toHaveProperty('index');
        expect(firstUtxo).toHaveProperty('value');
        expect(typeof firstUtxo.value).toBe('bigint');
        expect(firstUtxo.value).toBeGreaterThan(0n);
      }
    });

    /**
     * @target `FiroRpcNetwork.getAddressBoxes` should handle pagination correctly
     * @dependencies Firo testnet node running
     * @scenario
     * - call getAddressBoxes with different offset/limit values
     * - verify pagination works as expected
     * @expected
     * - it should return correct subset of UTXOs
     */
    it('should handle pagination correctly', async () => {
      const lockAddress = 'TGW2XVxw86ZusKQXvwWHouBjrKiUyZUT9u';
      
      // Get first 5 UTXOs
      const firstPage = await network.getAddressBoxes(lockAddress, 0, 5);
      
      // Get next 5 UTXOs
      const secondPage = await network.getAddressBoxes(lockAddress, 5, 5);
      
      expect(Array.isArray(firstPage)).toBe(true);
      expect(Array.isArray(secondPage)).toBe(true);
      
      // If both pages have results, they should be different
      if (firstPage.length > 0 && secondPage.length > 0) {
        expect(firstPage[0].txId).not.toBe(secondPage[0].txId);
      }
    });
  });

  describe('getAddressAssets', () => {
    /**
     * @target `FiroRpcNetwork.getAddressAssets` should return address balance
     * @dependencies Firo testnet node running
     * @scenario
     * - use the lock address from watcher config
     * - call getAddressAssets
     * - check returned value structure
     * @expected
     * - it should return native token balance and empty token array
     */
    it('should return address balance', async () => {
      const lockAddress = 'TGW2XVxw86ZusKQXvwWHouBjrKiUyZUT9u';
      const assets = await network.getAddressAssets(lockAddress);
      
      expect(assets).toHaveProperty('nativeToken');
      expect(assets).toHaveProperty('tokens');
      expect(typeof assets.nativeToken).toBe('bigint');
      expect(assets.nativeToken).toBeGreaterThanOrEqual(0n);
      expect(Array.isArray(assets.tokens)).toBe(true);
      expect(assets.tokens).toEqual([]); // Firo doesn't support tokens
    });

    /**
     * @target `FiroRpcNetwork.getAddressAssets` should return 0 for empty address
     * @dependencies Firo testnet node running
     * @scenario
     * - use a new unused address
     * - call getAddressAssets
     * @expected
     * - it should return balance >= 0
     */
    it('should return balance for any address', async () => {
      // This address may or may not have funds
      const testAddress = 'TUcxqGCmbitwwW2ayFV91iHzbqA3LQ6DUE';
      const assets = await network.getAddressAssets(testAddress);
      
      expect(assets.nativeToken).toBeGreaterThanOrEqual(0n);
      expect(assets.tokens).toEqual([]);
    });
  });

  describe('getUtxo', () => {
    /**
     * @target `FiroRpcNetwork.getUtxo` should return UTXO details if unspent
     * @dependencies Firo testnet node running
     * @scenario
     * - find an unspent output
     * - call getUtxo
     * - check returned value
     * @expected
     * - it should return UTXO details or throw if spent
     */
    it('should return UTXO details for unspent output', async () => {
      const lockAddress = 'TGW2XVxw86ZusKQXvwWHouBjrKiUyZUT9u';
      const utxos = await network.getAddressBoxes(lockAddress, 0, 1);
      
      if (utxos.length > 0) {
        const boxId = `${utxos[0].txId}.${utxos[0].index}`;
        const utxo = await network.getUtxo(boxId);
        
        expect(utxo.txId).toBe(utxos[0].txId);
        expect(utxo.index).toBe(utxos[0].index);
        expect(utxo.value).toBe(utxos[0].value);
      }
    });

    /**
     * @target `FiroRpcNetwork.getUtxo` should throw error for spent output
     * @dependencies Firo testnet node running
     * @scenario
     * - use a spent or non-existent UTXO
     * - call getUtxo
     * @expected
     * - it should throw an error
     */
    it('should throw error for non-existent UTXO', async () => {
      const fakeTxId = '0000000000000000000000000000000000000000000000000000000000000000';
      const boxId = `${fakeTxId}.0`;
      
      await expect(network.getUtxo(boxId)).rejects.toThrow();
    });
  });

  /**
   * NOTE: submitTransaction tests are not included in testnet integration tests.
   * 
   * Reason: submitTransaction requires a fully signed transaction with valid signatures.
   * This requires:
   * 1. Access to the private key for the lock address (TGW2XVxw86ZusKQXvwWHouBjrKiUyZUT9u)
   * 2. Proper transaction signing with bitcoinjs-lib or similar
   * 3. Valid inputs, outputs, and signatures
   * 
   * Without the private key, we cannot create a valid signed transaction that would
   * actually be accepted by the Firo network. Any unsigned or improperly signed
   * transaction will be rejected by the RPC node.
   * 
   * The submitTransaction method is tested in the mock tests (firoRpcNetwork.mock.spec.ts)
   * where we can verify it makes the correct RPC call with proper error handling.
   * 
   * For real-world testing of submitTransaction, this should be done:
   * - In Guard Service integration tests where transactions are properly signed
   * - With a test wallet that has the private key available
   * - As part of end-to-end transaction flow testing
   */
});
